export interface TaskEmbedding {
    id: string;
    taskId: string | number;
    description: string;
    type: string;
    status: string;
    result?: any;
    metadata?: Record<string, any>;
} 