// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { delay } from "@azure/core-http";
import { Poller, PollOperation, PollOperationState } from "@azure/core-lro";
import { TrainingFileFilter, GetModelOptions } from "../../formTrainingClient";

import {
  ModelStatus,
  GeneratedClientTrainCustomModelAsyncResponse as TrainCustomModelAsyncResponse
} from "../../generated/models";
export { ModelStatus, TrainCustomModelAsyncResponse };

/**
 * Defines the operations from a {@link FormRecognizerClient} that are needed for the poller
 * returned by {@link FormRecognizerClient.beginTraining} to work.
 */
export type TrainPollerClient<T> = {
  getCustomModel: (modelId: string, options: GetModelOptions) => Promise<T>;
  trainCustomModelInternal: (
    source: string,
    useLabelFile?: boolean,
    options?: TrainingFileFilter
  ) => Promise<{ location?: string }>;
};

/**
 * The state used by the poller returned from {@link FormTrainingClient.beginTraining}.
 *
 * This state is passed into the user-specified `onProgress` callback
 * whenever copy progress is detected.
 */
export interface BeginTrainingPollState<T> extends PollOperationState<T> {
  /**
   * The instance of {@link TrainPollerClient} that is used when calling {@link FormTrainingClient.beginTraining}.
   */
  readonly client: TrainPollerClient<T>;
  /**
   * The accessible url to an Azure Blob Storage container holding the training documents.
   */
  source: string;
  /**
   * The id of the custom form model being created from the training operation.
   */
  modelId?: string;
  /**
   * the status of the created model.
   */
  status: ModelStatus;
  /**
   * Option to filter training files.
   */
  readonly trainModelOptions?: TrainingFileFilter;
}

export interface BeginTrainingPollerOperation<T>
  extends PollOperation<BeginTrainingPollState<T>, T> {}

/**
 * @internal
 */
export interface BeginTrainingPollerOptions<T> {
  client: TrainPollerClient<T>;
  source: string;
  intervalInMs?: number;
  onProgress?: (state: BeginTrainingPollState<T>) => void;
  resumeFrom?: string;
  trainModelOptions?: TrainingFileFilter;
}

/**
 * Class that represents a poller that waits until a model has been trained.
 */
export class BeginTrainingPoller<T extends { status: ModelStatus }> extends Poller<
  BeginTrainingPollState<T>,
  T
> {
  public intervalInMs: number;

  constructor(options: BeginTrainingPollerOptions<T>) {
    const {
      client,
      source,
      intervalInMs = 5000,
      onProgress,
      resumeFrom,
      trainModelOptions
    } = options;

    let state: BeginTrainingPollState<T> | undefined;

    if (resumeFrom) {
      state = JSON.parse(resumeFrom).state;
    }

    const operation = makeBeginTrainingPollOperation<T>({
      ...state,
      client,
      source,
      status: "creating",
      trainModelOptions
    });

    super(operation);

    if (typeof onProgress === "function") {
      this.onProgress(onProgress);
    }

    this.intervalInMs = intervalInMs;
  }

  public delay(): Promise<void> {
    return delay(this.intervalInMs);
  }
}

/**
 * Creates a poll operation given the provided state.
 * @ignore
 */
function makeBeginTrainingPollOperation<T extends { status: ModelStatus }>(
  state: BeginTrainingPollState<T>
): BeginTrainingPollerOperation<T> {
  return {
    state: { ...state },

    async cancel(_options = {}): Promise<BeginTrainingPollerOperation<T>> {
      throw new Error("Cancel operation is not supported.");
    },

    async update(options = {}): Promise<BeginTrainingPollerOperation<T>> {
      const state = this.state;
      const { client, source, trainModelOptions } = state;

      if (!state.isStarted) {
        state.isStarted = true;
        const result = await client.trainCustomModelInternal(
          source,
          false,
          trainModelOptions || {}
        );
        if (!result.location) {
          throw new Error("Expect a valid 'operationLocation' to retrieve analyze results");
        }
        const lastSlashIndex = result.location.lastIndexOf("/");
        state.modelId = result.location.substring(lastSlashIndex + 1);
      }

      const model = await client.getCustomModel(state.modelId!, {
        abortSignal: trainModelOptions?.abortSignal
      });

      state.status = model.status;

      if (!state.isCompleted) {
        if (model.status === "creating" && typeof options.fireProgress === "function") {
          options.fireProgress(state);
        } else if (model.status === "ready") {
          state.result = model;
          state.isCompleted = true;
        } else if (model.status === "invalid") {
          state.error = new Error(`Model training failed with invalid model status.`);
          state.result = model;
          state.isCompleted = true;
        }
      }

      return makeBeginTrainingPollOperation(state);
    },

    toString() {
      return JSON.stringify({ state: this.state }, (key, value) => {
        if (key === "client") {
          return undefined;
        }
        return value;
      });
    }
  };
}
