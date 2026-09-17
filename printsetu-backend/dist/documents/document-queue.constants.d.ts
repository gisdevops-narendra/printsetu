export declare const DOCUMENT_ANALYSIS_QUEUE = "document-analysis";
export declare const DOCUMENT_ANALYSIS_JOB_OPTS: {
    attempts: number;
    backoff: {
        type: "exponential";
        delay: number;
    };
    removeOnComplete: boolean;
    removeOnFail: boolean;
};
