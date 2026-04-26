/**
 * Interactive snap templates
 *
 * These templates produce snap JSON that triggers server-side handlers on POST.
 * They store metadata (template type, config) so the server knows how to handle submissions.
 */
export declare function poll(slots: {
    question: string;
    options: string[];
    theme?: string;
}): {
    snapJson: any;
    meta: {
        template: string;
        config: Record<string, any>;
    };
};
export declare function pollResults(question: string, options: string[], counts: Record<string, number>, userVote: string | null, theme: string): any;
export declare function quiz(slots: {
    baseId: string;
    questions: {
        question: string;
        options: string[];
        correct: number;
    }[];
    theme?: string;
    baseUrl?: string;
}): {
    pages: Array<{
        snapJson: any;
        meta: {
            template: string;
            config: Record<string, any>;
        };
    }>;
};
export declare function claim(slots: {
    title: string;
    description: string;
    buttonLabel?: string;
    tokenAction?: {
        type: string;
        params: Record<string, any>;
    };
    theme?: string;
}): {
    snapJson: any;
    meta: {
        template: string;
        config: Record<string, any>;
    };
};
export declare function tipJar(slots: {
    id: string;
    title?: string;
    description?: string;
    recipientFid: number;
    tokens?: Array<{
        label: string;
        token: string;
        amount?: string;
    }>;
    theme?: string;
}): {
    snapJson: any;
};
export declare function tokenBuy(slots: {
    id: string;
    title: string;
    description?: string;
    buyToken: string;
    sellToken?: string;
    buttonLabel?: string;
    badges?: string[];
    theme?: string;
}): {
    snapJson: any;
};
export declare function tokenShowcase(slots: {
    id: string;
    title: string;
    description?: string;
    token: string;
    actions?: Array<{
        type: string;
        label: string;
        params: Record<string, any>;
    }>;
    badges?: string[];
    theme?: string;
}): {
    snapJson: any;
};
export declare function rating(slots: {
    id?: string;
    subject: string;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    theme?: string;
}): {
    snapJson: any;
    meta: {
        template: string;
        config: Record<string, any>;
    };
};
export declare function ratingResults(subject: string, avg: number, count: number, userRating: number | null, min: number, max: number, theme: string): any;
export declare function claimed(title: string, description: string, claimCount: number, theme: string): any;
export declare function textEntry(slots: {
    prompt: string;
    inputName?: string;
    inputType?: "text" | "number";
    placeholder?: string;
    maxLength?: number;
    buttonLabel?: string;
    theme?: string;
}): {
    snapJson: any;
    meta: {
        template: string;
        config: Record<string, any>;
    };
};
export declare function textEntryResults(prompt: string, userResponse: string, submissionCount: number, theme: string): any;
