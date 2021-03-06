// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  PipelineOptions,
  createPipelineFromOptions,
  InternalPipelineOptions,
  isTokenCredential,
  bearerTokenAuthenticationPolicy,
  operationOptionsToRequestOptionsBase,
  OperationOptions,
  ServiceClientCredentials
} from "@azure/core-http";
import { TokenCredential, KeyCredential } from "@azure/core-auth";
import { SDK_VERSION } from "./constants";
import { GeneratedClient } from "./generated/generatedClient";
import { logger } from "./logger";
import {
  LanguageInput as DetectLanguageInput,
  MultiLanguageInput as TextDocumentInput
} from "./generated/models";
import {
  DetectLanguageResultArray,
  makeDetectLanguageResultArray
} from "./detectLanguageResultArray";
import {
  RecognizeCategorizedEntitiesResultArray,
  makeRecognizeCategorizedEntitiesResultArray
} from "./recognizeCategorizedEntitiesResultArray";
import {
  AnalyzeSentimentResultArray,
  makeAnalyzeSentimentResultArray
} from "./analyzeSentimentResultArray";
import {
  makeExtractKeyPhrasesResultArray,
  ExtractKeyPhrasesResultArray
} from "./extractKeyPhrasesResultArray";
import {
  RecognizeLinkedEntitiesResultArray,
  makeRecognizeLinkedEntitiesResultArray
} from "./recognizeLinkedEntitiesResultArray";
import { createSpan } from "./tracing";
import { CanonicalCode } from "@opentelemetry/api";
import { createTextAnalyticsAzureKeyCredentialPolicy } from "./azureKeyCredentialPolicy";

const DEFAULT_COGNITIVE_SCOPE = "https://cognitiveservices.azure.com/.default";

/**
 * Client options used to configure TextAnalytics API requests.
 */
export interface TextAnalyticsClientOptions extends PipelineOptions {
  /**
   * The default country hint to use. Defaults to "us".
   */
  defaultCountryHint?: string;

  /**
   * The default language to use. Defaults to "en".
   */
  defaultLanguage?: string;
}

/**
 * Options common to all text analytics operations.
 */
export interface TextAnalyticsOperationOptions extends OperationOptions {
  /**
   * This value indicates which model will be used for scoring. If a model-version is
   * not specified, the API should default to the latest, non-preview version.
   * For supported model versions, see operation-specific documentation, for example:
   * https://docs.microsoft.com/en-us/azure/cognitive-services/text-analytics/how-tos/text-analytics-how-to-sentiment-analysis#model-versioning
   */
  modelVersion?: string;
  /**
   * If set to true, response will contain input and document level statistics.
   */
  includeStatistics?: boolean;
}

/**
 * Options for the detect languages operation.
 */
export type DetectLanguageOptions = TextAnalyticsOperationOptions;

/**
 * Options for the recognize entities operation.
 */
export type RecognizeCategorizedEntitiesOptions = TextAnalyticsOperationOptions;

/**
 * Options for the analyze sentiment operation.
 */
export type AnalyzeSentimentOptions = TextAnalyticsOperationOptions;

/**
 * Options for the extract key phrases operation.
 */
export type ExtractKeyPhrasesOptions = TextAnalyticsOperationOptions;

/**
 * Options for the recognize linked entities operation.
 */
export type RecognizeLinkedEntitiesOptions = TextAnalyticsOperationOptions;

/**
 * Client class for interacting with Azure Text Analytics.
 */
export class TextAnalyticsClient {
  /**
   * The URL to the TextAnalytics endpoint
   */
  public readonly endpointUrl: string;

  /**
   * The default country hint to use. Defaults to "us".
   */
  public defaultCountryHint: string;

  /**
   * The default language to use. Defaults to "en".
   */
  public defaultLanguage: string;

  /**
   * @internal
   * @ignore
   * A reference to the auto-generated TextAnalytics HTTP client.
   */
  private readonly client: GeneratedClient;

  /**
   * Creates an instance of TextAnalyticsClient.
   *
   * Example usage:
   * ```ts
   * import { TextAnalyticsClient, AzureKeyCredential } from "@azure/ai-text-analytics";
   *
   * const client = new TextAnalyticsClient(
   *    "<service endpoint>",
   *    new AzureKeyCredential("<api key>")
   * );
   * ```
   * @param {string} endpointUrl The URL to the TextAnalytics endpoint
   * @param {TokenCredential | KeyCredential} credential Used to authenticate requests to the service.
   * @param {TextAnalyticsClientOptions} [options] Used to configure the TextAnalytics client.
   */
  constructor(
    endpointUrl: string,
    credential: TokenCredential | KeyCredential,
    options: TextAnalyticsClientOptions = {}
  ) {
    this.endpointUrl = endpointUrl;
    const { defaultCountryHint = "us", defaultLanguage = "en", ...pipelineOptions } = options;
    this.defaultCountryHint = defaultCountryHint;
    this.defaultLanguage = defaultLanguage;

    const libInfo = `azsdk-js-ai-textanalytics/${SDK_VERSION}`;
    if (!pipelineOptions.userAgentOptions) {
      pipelineOptions.userAgentOptions = {};
    }
    if (pipelineOptions.userAgentOptions.userAgentPrefix) {
      pipelineOptions.userAgentOptions.userAgentPrefix = `${pipelineOptions.userAgentOptions.userAgentPrefix} ${libInfo}`;
    } else {
      pipelineOptions.userAgentOptions.userAgentPrefix = libInfo;
    }

    const authPolicy = isTokenCredential(credential)
      ? bearerTokenAuthenticationPolicy(credential, DEFAULT_COGNITIVE_SCOPE)
      : createTextAnalyticsAzureKeyCredentialPolicy(credential);

    const internalPipelineOptions: InternalPipelineOptions = {
      ...pipelineOptions,
      ...{
        loggingOptions: {
          logger: logger.info,
          allowedHeaderNames: ["x-ms-correlation-request-id", "x-ms-request-id"]
        }
      }
    };

    const pipeline = createPipelineFromOptions(internalPipelineOptions, authPolicy);

    // The contract with the generated client requires a credential, even though it is never used
    // when a pipeline is provided. Until that contract can be changed, this dummy credential will
    // throw an error if the client ever attempts to use it.
    const dummyCredential: ServiceClientCredentials = {
      signRequest() {
        throw new Error(
          "Internal error: Attempted to use credential from service client, but a pipeline was provided."
        );
      }
    };

    this.client = new GeneratedClient(dummyCredential, this.endpointUrl, pipeline);
  }

  /**
   * Runs a predictive model to determine the language that the passed-in
   * input strings are written in, and returns, for each one, the detected
   * language as well as a score indicating the model's confidence that the
   * inferred language is correct.  Scores close to 1 indicate high certainty in
   * the result.  120 languages are supported.
   * @param documents A collection of input strings to analyze.
   * @param countryHint Indicates the country of origin for all of
   *   the input strings to assist the text analytics model in predicting
   *   the language they are written in.  If unspecified, this value will be
   *   set to the default country hint in `TextAnalyticsClientOptions`.
   *   If set to an empty string, or the string "none", the service will apply a
   *   model where the country is explicitly unset.
   *   The same country hint is applied to all strings in the input collection.
   * @param options Optional parameters for the operation.
   */
  public async detectLanguage(
    documents: string[],
    countryHint?: string,
    options?: DetectLanguageOptions
  ): Promise<DetectLanguageResultArray>;
  /**
   * Runs a predictive model to determine the language that the passed-in
   * input document are written in, and returns, for each one, the detected
   * language as well as a score indicating the model's confidence that the
   * inferred language is correct.  Scores close to 1 indicate high certainty in
   * the result.  120 languages are supported.
   * @param documents A collection of input documents to analyze.
   * @param options Optional parameters for the operation.
   */
  public async detectLanguage(
    documents: DetectLanguageInput[],
    options?: DetectLanguageOptions
  ): Promise<DetectLanguageResultArray>;
  public async detectLanguage(
    documents: string[] | DetectLanguageInput[],
    countryHintOrOptions?: string | DetectLanguageOptions,
    options?: DetectLanguageOptions
  ): Promise<DetectLanguageResultArray> {
    let realOptions: DetectLanguageOptions;
    let realInputs: DetectLanguageInput[];

    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error("'documents' must be a non-empty array");
    }

    if (isStringArray(documents)) {
      const countryHint = (countryHintOrOptions as string) || this.defaultCountryHint;
      realInputs = convertToDetectLanguageInput(documents, countryHint);
      realOptions = options || {};
    } else {
      // Replace "none" hints with ""
      realInputs = documents.map((input) => ({
        ...input,
        countryHint: input.countryHint === "none" ? "" : input.countryHint
      }));
      realOptions = (countryHintOrOptions as DetectLanguageOptions) || {};
    }

    const { span, updatedOptions: finalOptions } = createSpan(
      "TextAnalyticsClient-detectLanguages",
      realOptions
    );

    try {
      const result = await this.client.languages(
        {
          documents: realInputs
        },
        operationOptionsToRequestOptionsBase(finalOptions)
      );

      return makeDetectLanguageResultArray(
        realInputs,
        result.documents,
        result.errors,
        result.modelVersion,
        result.statistics
      );
    } catch (e) {
      span.setStatus({
        code: CanonicalCode.UNKNOWN,
        message: e.message
      });
      throw e;
    } finally {
      span.end();
    }
  }

  /**
   * Runs a predictive model to identify a collection of named entities
   * in the passed-in input strings, and categorize those entities into types
   * such as person, location, or organization.  For more information on 
   * available categories, see
   * https://docs.microsoft.com/en-us/azure/cognitive-services/Text-Analytics/named-entity-types.
   * For a list of languages supported by this operation, see
   * https://docs.microsoft.com/en-us/azure/cognitive-services/text-analytics/language-support.
   * @param documents The input strings to analyze.
   * @param language The language that all the input strings are
        written in. If unspecified, this value will be set to the default
        language in `TextAnalyticsClientOptions`.  
        If set to an empty string, the service will apply a model
        where the lanuage is explicitly set to "None".
   * @param options Optional parameters for the operation.
   */
  public async recognizeEntities(
    documents: string[],
    language?: string,
    // eslint-disable-next-line @azure/azure-sdk/ts-naming-options
    options?: RecognizeCategorizedEntitiesOptions
  ): Promise<RecognizeCategorizedEntitiesResultArray>;
  /**
   * Runs a predictive model to identify a collection of named entities
   * in the passed-in input documents, and categorize those entities into types
   * such as person, location, or organization.  For more information on
   * available categories, see
   * https://docs.microsoft.com/en-us/azure/cognitive-services/Text-Analytics/named-entity-types.
   * For a list of languages supported by this operation, see
   * https://docs.microsoft.com/en-us/azure/cognitive-services/text-analytics/language-support.
   * @param documents The input documents to analyze.
   * @param options Optional parameters for the operation.
   */
  public async recognizeEntities(
    documents: TextDocumentInput[],
    // eslint-disable-next-line @azure/azure-sdk/ts-naming-options
    options?: RecognizeCategorizedEntitiesOptions
  ): Promise<RecognizeCategorizedEntitiesResultArray>;
  public async recognizeEntities(
    documents: string[] | TextDocumentInput[],
    languageOrOptions?: string | RecognizeCategorizedEntitiesOptions,
    // eslint-disable-next-line @azure/azure-sdk/ts-naming-options
    options?: RecognizeCategorizedEntitiesOptions
  ): Promise<RecognizeCategorizedEntitiesResultArray> {
    let realOptions: RecognizeCategorizedEntitiesOptions;
    let realInputs: TextDocumentInput[];

    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error("'documents' must be a non-empty array");
    }

    if (isStringArray(documents)) {
      const language = (languageOrOptions as string) || this.defaultLanguage;
      realInputs = convertToTextDocumentInput(documents, language);
      realOptions = options || {};
    } else {
      realInputs = documents;
      realOptions = (languageOrOptions as RecognizeCategorizedEntitiesOptions) || {};
    }

    const { span, updatedOptions: finalOptions } = createSpan(
      "TextAnalyticsClient-recognizeEntities",
      realOptions
    );

    try {
      const result = await this.client.entitiesRecognitionGeneral(
        {
          documents: realInputs
        },
        operationOptionsToRequestOptionsBase(finalOptions)
      );

      return makeRecognizeCategorizedEntitiesResultArray(
        realInputs,
        result.documents,
        result.errors,
        result.modelVersion,
        result.statistics
      );
    } catch (e) {
      span.setStatus({
        code: CanonicalCode.UNKNOWN,
        message: e.message
      });
      throw e;
    } finally {
      span.end();
    }
  }

  /**
   * Runs a predictive model to identify the positive, negative, neutral, or mixed
   * sentiment contained in the input strings, as well as scores indicating
   * the model's confidence in each of the predicted sentiments.
   * For a list of languages supported by this operation, see
   * https://docs.microsoft.com/en-us/azure/cognitive-services/text-analytics/language-support.
   * @param documents The input strings to analyze.
   * @param language The language that all the input strings are
        written in. If unspecified, this value will be set to the default
        language in `TextAnalyticsClientOptions`.  
        If set to an empty string, the service will apply a model
        where the lanuage is explicitly set to "None".
   * @param options Optional parameters for the operation.
   */
  public async analyzeSentiment(
    documents: string[],
    language?: string,
    options?: AnalyzeSentimentOptions
  ): Promise<AnalyzeSentimentResultArray>;
  /**
   * Runs a predictive model to identify the positive, negative or neutral, or mixed
   * sentiment contained in the input documents, as well as scores indicating
   * the model's confidence in each of the predicted sentiments.
   * For a list of languages supported by this operation, see
   * https://docs.microsoft.com/en-us/azure/cognitive-services/text-analytics/language-support.
   * @param documents The input documents to analyze.
   * @param options Optional parameters for the operation.
   */
  public async analyzeSentiment(
    documents: TextDocumentInput[],
    options?: AnalyzeSentimentOptions
  ): Promise<AnalyzeSentimentResultArray>;
  public async analyzeSentiment(
    documents: string[] | TextDocumentInput[],
    languageOrOptions?: string | AnalyzeSentimentOptions,
    options?: AnalyzeSentimentOptions
  ): Promise<AnalyzeSentimentResultArray> {
    let realOptions: AnalyzeSentimentOptions;
    let realInputs: TextDocumentInput[];

    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error("'documents' must be a non-empty array");
    }

    if (isStringArray(documents)) {
      const language = (languageOrOptions as string) || this.defaultLanguage;
      realInputs = convertToTextDocumentInput(documents, language);
      realOptions = options || {};
    } else {
      realInputs = documents;
      realOptions = (languageOrOptions as AnalyzeSentimentOptions) || {};
    }

    const { span, updatedOptions: finalOptions } = createSpan(
      "TextAnalyticsClient-analyzeSentiment",
      realOptions
    );

    try {
      const result = await this.client.sentiment(
        {
          documents: realInputs
        },
        operationOptionsToRequestOptionsBase(finalOptions)
      );

      return makeAnalyzeSentimentResultArray(
        realInputs,
        result.documents,
        result.errors,
        result.modelVersion,
        result.statistics
      );
    } catch (e) {
      span.setStatus({
        code: CanonicalCode.UNKNOWN,
        message: e.message
      });
      throw e;
    } finally {
      span.end();
    }
  }

  /**
   * Runs a model to identify a collection of significant phrases
   * found in the passed-in input strings.
   * For a list of languages supported by this operation, see
   * https://docs.microsoft.com/en-us/azure/cognitive-services/text-analytics/language-support.
   * @param documents The input strings to analyze.
   * @param language The language that all the input strings are
        written in. If unspecified, this value will be set to the default
        language in `TextAnalyticsClientOptions`.  
        If set to an empty string, the service will apply a model
        where the lanuage is explicitly set to "None".
   * @param options Optional parameters for the operation.
   */
  public async extractKeyPhrases(
    documents: string[],
    language?: string,
    options?: ExtractKeyPhrasesOptions
  ): Promise<ExtractKeyPhrasesResultArray>;
  /**
   * Runs a model to identify a collection of significant phrases
   * found in the passed-in input documents.
   * For a list of languages supported by this operation, see
   * https://docs.microsoft.com/en-us/azure/cognitive-services/text-analytics/language-support.
   * @param documents The input documents to analyze.
   * @param options Optional parameters for the operation.
   */
  public async extractKeyPhrases(
    documents: TextDocumentInput[],
    options?: ExtractKeyPhrasesOptions
  ): Promise<ExtractKeyPhrasesResultArray>;
  public async extractKeyPhrases(
    documents: string[] | TextDocumentInput[],
    languageOrOptions?: string | ExtractKeyPhrasesOptions,
    options?: ExtractKeyPhrasesOptions
  ): Promise<ExtractKeyPhrasesResultArray> {
    let realOptions: ExtractKeyPhrasesOptions;
    let realInputs: TextDocumentInput[];

    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error("'documents' must be a non-empty array");
    }

    if (isStringArray(documents)) {
      const language = (languageOrOptions as string) || this.defaultLanguage;
      realInputs = convertToTextDocumentInput(documents, language);
      realOptions = options || {};
    } else {
      realInputs = documents;
      realOptions = (languageOrOptions as ExtractKeyPhrasesOptions) || {};
    }

    const { span, updatedOptions: finalOptions } = createSpan(
      "TextAnalyticsClient-extractKeyPhrases",
      realOptions
    );

    try {
      const result = await this.client.keyPhrases(
        {
          documents: realInputs
        },
        operationOptionsToRequestOptionsBase(finalOptions)
      );

      return makeExtractKeyPhrasesResultArray(
        realInputs,
        result.documents,
        result.errors,
        result.modelVersion,
        result.statistics
      );
    } catch (e) {
      span.setStatus({
        code: CanonicalCode.UNKNOWN,
        message: e.message
      });
      throw e;
    } finally {
      span.end();
    }
  }

  /**
   * Runs a predictive model to identify a collection of entities
   * found in the passed-in input strings, and include information linking the
   * entities to their corresponding entries in a well-known knowledge base.
   * For a list of languages supported by this operation, see
   * https://docs.microsoft.com/en-us/azure/cognitive-services/text-analytics/language-support.
   * @param documents The input strings to analyze.
   * @param language The language that all the input strings are
        written in. If unspecified, this value will be set to the default
        language in `TextAnalyticsClientOptions`.  
        If set to an empty string, the service will apply a model
        where the lanuage is explicitly set to "None".
   * @param options Optional parameters for the operation.
   */
  public async recognizeLinkedEntities(
    documents: string[],
    language?: string,
    options?: RecognizeLinkedEntitiesOptions
  ): Promise<RecognizeLinkedEntitiesResultArray>;
  /**
   * Runs a predictive model to identify a collection of entities
   * found in the passed-in input documents, and include information linking the
   * entities to their corresponding entries in a well-known knowledge base.
   * For a list of languages supported by this operation, see
   * https://docs.microsoft.com/en-us/azure/cognitive-services/text-analytics/language-support.
   * @param documents The input documents to analyze.
   * @param options Optional parameters for the operation.
   */
  public async recognizeLinkedEntities(
    documents: TextDocumentInput[],
    options?: RecognizeLinkedEntitiesOptions
  ): Promise<RecognizeLinkedEntitiesResultArray>;
  public async recognizeLinkedEntities(
    documents: string[] | TextDocumentInput[],
    languageOrOptions?: string | RecognizeLinkedEntitiesOptions,
    options?: RecognizeLinkedEntitiesOptions
  ): Promise<RecognizeLinkedEntitiesResultArray> {
    let realOptions: RecognizeLinkedEntitiesOptions;
    let realInputs: TextDocumentInput[];

    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error("'documents' must be a non-empty array");
    }

    if (isStringArray(documents)) {
      const language = (languageOrOptions as string) || this.defaultLanguage;
      realInputs = convertToTextDocumentInput(documents, language);
      realOptions = options || {};
    } else {
      realInputs = documents;
      realOptions = (languageOrOptions as RecognizeLinkedEntitiesOptions) || {};
    }

    const { span, updatedOptions: finalOptions } = createSpan(
      "TextAnalyticsClient-recognizeLinkedEntities",
      realOptions
    );

    try {
      const result = await this.client.entitiesLinking(
        {
          documents: realInputs
        },
        operationOptionsToRequestOptionsBase(finalOptions)
      );

      return makeRecognizeLinkedEntitiesResultArray(
        realInputs,
        result.documents,
        result.errors,
        result.modelVersion,
        result.statistics
      );
    } catch (e) {
      span.setStatus({
        code: CanonicalCode.UNKNOWN,
        message: e.message
      });
      throw e;
    } finally {
      span.end();
    }
  }
}

function isStringArray(documents: any[]): documents is string[] {
  return typeof documents[0] === "string";
}

function convertToDetectLanguageInput(
  inputs: string[],
  countryHint: string
): DetectLanguageInput[] {
  if (countryHint === "none") {
    countryHint = "";
  }
  return inputs.map(
    (text: string, index): DetectLanguageInput => {
      return {
        id: String(index),
        countryHint,
        text
      };
    }
  );
}

function convertToTextDocumentInput(inputs: string[], language: string): TextDocumentInput[] {
  return inputs.map(
    (text: string, index): TextDocumentInput => {
      return {
        id: String(index),
        language,
        text
      };
    }
  );
}
