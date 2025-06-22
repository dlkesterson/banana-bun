import { toolRunner } from '../tools/tool_runner';
import { logger } from '../utils/logger';
import { getDatabase } from '../db';
import type { ReviewResult } from '../types/review';
import type { TaskAssertion, AssertionResult } from '../types/task';

export class ReviewExecutor {
    private readonly DEFAULT_MODEL = 'qwen3:8b';
    private readonly DEFAULT_SYSTEM_PROMPT = `You are a task output reviewer. Your job is to:
1. Review the output of a task
2. Validate if it meets the requirements
3. Provide constructive feedback
4. Suggest improvements if needed

Respond in JSON format:
{
    "passed": boolean,
    "score": number (0-100),
    "feedback": string,
    "suggestions": string[]
}`;

    async reviewOutput(
        output: any,
        requirements: string,
        model: string = this.DEFAULT_MODEL,
        taskId?: number,
        assertions?: TaskAssertion[]
    ): Promise<ReviewResult> {
        try {
            // Phase 3: Check assertions first if provided
            let assertionResults: AssertionResult[] = [];
            if (assertions && assertions.length > 0) {
                assertionResults = await this.validateAssertions(output, assertions);
            }

            // Build enhanced prompt with assertion context
            let prompt = `Review the following task output against these requirements:

Requirements:
${requirements}

Output:
${JSON.stringify(output, null, 2)}`;

            if (assertionResults.length > 0) {
                prompt += `\n\nAssertion Results:
${assertionResults.map(r => `- ${r.assertion_id}: ${r.passed ? 'PASSED' : 'FAILED'} - ${r.message}`).join('\n')}`;
            }

            prompt += '\n\nPlease review and respond in the specified JSON format.';

            const result = await toolRunner.executeTool('ollama_chat', {
                model,
                prompt,
                system: this.DEFAULT_SYSTEM_PROMPT
            });

            const review = JSON.parse(result.response) as ReviewResult;

            // Phase 3: Save review to database
            if (taskId) {
                await this.saveReviewResult(taskId, review, model, requirements, JSON.stringify(output), assertionResults);
            }

            await logger.info('Review completed', {
                taskId,
                passed: review.passed,
                score: review.score,
                feedback: review.feedback,
                assertionsPassed: assertionResults.filter(r => r.passed).length,
                assertionsFailed: assertionResults.filter(r => !r.passed).length
            });

            return review;
        } catch (error) {
            await logger.error('Review failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async reviewCode(
        code: string,
        requirements: string,
        language: string,
        model: string = this.DEFAULT_MODEL
    ): Promise<ReviewResult> {
        try {
            const prompt = `Review the following ${language} code against these requirements:

Requirements:
${requirements}

Code:
\`\`\`${language}
${code}
\`\`\`

Please review and respond in the specified JSON format.`;

            const result = await toolRunner.executeTool('ollama_chat', {
                model,
                prompt,
                system: this.DEFAULT_SYSTEM_PROMPT
            });

            const review = JSON.parse(result.response) as ReviewResult;

            await logger.info('Code review completed', {
                passed: review.passed,
                score: review.score,
                feedback: review.feedback
            });

            return review;
        } catch (error) {
            await logger.error('Code review failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async reviewText(
        text: string,
        requirements: string,
        model: string = this.DEFAULT_MODEL
    ): Promise<ReviewResult> {
        try {
            const prompt = `Review the following text against these requirements:

Requirements:
${requirements}

Text:
${text}

Please review and respond in the specified JSON format.`;

            const result = await toolRunner.executeTool('ollama_chat', {
                model,
                prompt,
                system: this.DEFAULT_SYSTEM_PROMPT
            });

            const review = JSON.parse(result.response) as ReviewResult;

            await logger.info('Text review completed', {
                passed: review.passed,
                score: review.score,
                feedback: review.feedback
            });

            return review;
        } catch (error) {
            await logger.error('Text review failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    // Phase 3: Assertion validation system
    async validateAssertions(output: any, assertions: TaskAssertion[]): Promise<AssertionResult[]> {
        const results: AssertionResult[] = [];

        for (const assertion of assertions) {
            const result = await this.validateSingleAssertion(output, assertion);
            results.push(result);
        }

        return results;
    }

    private async validateSingleAssertion(output: any, assertion: TaskAssertion): Promise<AssertionResult> {
        const assertionId = assertion.id || `${assertion.type}_${Date.now()}`;

        try {
            switch (assertion.type) {
                case 'output_contains':
                    return this.validateOutputContains(output, assertion, assertionId);
                case 'output_not_contains':
                    return this.validateOutputNotContains(output, assertion, assertionId);
                case 'file_exists':
                    return await this.validateFileExists(assertion, assertionId);
                case 'file_not_exists':
                    return await this.validateFileNotExists(assertion, assertionId);
                case 'json_schema':
                    return this.validateJsonSchema(output, assertion, assertionId);
                case 'regex_match':
                    return this.validateRegexMatch(output, assertion, assertionId);
                case 'custom_script':
                    return await this.validateCustomScript(output, assertion, assertionId);
                default:
                    return {
                        assertion_id: assertionId,
                        passed: false,
                        message: `Unknown assertion type: ${assertion.type}`,
                        severity: 'error'
                    };
            }
        } catch (error) {
            return {
                assertion_id: assertionId,
                passed: false,
                message: `Assertion validation failed: ${error instanceof Error ? error.message : String(error)}`,
                severity: 'error'
            };
        }
    }

    private validateOutputContains(output: any, assertion: TaskAssertion, assertionId: string): AssertionResult {
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
        const condition = assertion.condition;
        const contains = outputStr.includes(condition);

        return {
            assertion_id: assertionId,
            passed: contains,
            message: assertion.message || `Output ${contains ? 'contains' : 'does not contain'} "${condition}"`,
            severity: assertion.severity,
            actual_value: outputStr.length > 200 ? outputStr.substring(0, 200) + '...' : outputStr,
            expected_value: condition
        };
    }

    private validateOutputNotContains(output: any, assertion: TaskAssertion, assertionId: string): AssertionResult {
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
        const condition = assertion.condition;
        const contains = outputStr.includes(condition);

        return {
            assertion_id: assertionId,
            passed: !contains,
            message: assertion.message || `Output ${contains ? 'contains' : 'does not contain'} "${condition}"`,
            severity: assertion.severity,
            actual_value: outputStr.length > 200 ? outputStr.substring(0, 200) + '...' : outputStr,
            expected_value: `NOT "${condition}"`
        };
    }

    private async validateFileExists(assertion: TaskAssertion, assertionId: string): Promise<AssertionResult> {
        const filePath = assertion.condition;
        try {
            const file = Bun.file(filePath);
            const exists = await file.exists();

            return {
                assertion_id: assertionId,
                passed: exists,
                message: assertion.message || `File ${exists ? 'exists' : 'does not exist'}: ${filePath}`,
                severity: assertion.severity,
                expected_value: filePath
            };
        } catch (error) {
            return {
                assertion_id: assertionId,
                passed: false,
                message: `File check failed: ${error instanceof Error ? error.message : String(error)}`,
                severity: 'error'
            };
        }
    }

    private async validateFileNotExists(assertion: TaskAssertion, assertionId: string): Promise<AssertionResult> {
        const filePath = assertion.condition;
        try {
            const file = Bun.file(filePath);
            const exists = await file.exists();

            return {
                assertion_id: assertionId,
                passed: !exists,
                message: assertion.message || `File ${exists ? 'exists' : 'does not exist'}: ${filePath}`,
                severity: assertion.severity,
                expected_value: `NOT ${filePath}`
            };
        } catch (error) {
            return {
                assertion_id: assertionId,
                passed: false,
                message: `File check failed: ${error instanceof Error ? error.message : String(error)}`,
                severity: 'error'
            };
        }
    }

    private validateJsonSchema(output: any, assertion: TaskAssertion, assertionId: string): AssertionResult {
        // Simple JSON schema validation - can be enhanced with a proper schema validator
        const schema = assertion.condition;

        try {
            if (typeof schema === 'object' && schema.type) {
                const actualType = Array.isArray(output) ? 'array' : typeof output;
                const passed = actualType === schema.type;

                return {
                    assertion_id: assertionId,
                    passed,
                    message: assertion.message || `Output type is ${actualType}, expected ${schema.type}`,
                    severity: assertion.severity,
                    actual_value: actualType,
                    expected_value: schema.type
                };
            }

            return {
                assertion_id: assertionId,
                passed: false,
                message: 'Invalid JSON schema format',
                severity: 'error'
            };
        } catch (error) {
            return {
                assertion_id: assertionId,
                passed: false,
                message: `JSON schema validation failed: ${error instanceof Error ? error.message : String(error)}`,
                severity: 'error'
            };
        }
    }

    private validateRegexMatch(output: any, assertion: TaskAssertion, assertionId: string): AssertionResult {
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
        const pattern = assertion.condition;

        try {
            const regex = new RegExp(pattern);
            const matches = regex.test(outputStr);

            return {
                assertion_id: assertionId,
                passed: matches,
                message: assertion.message || `Output ${matches ? 'matches' : 'does not match'} pattern: ${pattern}`,
                severity: assertion.severity,
                actual_value: outputStr.length > 200 ? outputStr.substring(0, 200) + '...' : outputStr,
                expected_value: pattern
            };
        } catch (error) {
            return {
                assertion_id: assertionId,
                passed: false,
                message: `Regex validation failed: ${error instanceof Error ? error.message : String(error)}`,
                severity: 'error'
            };
        }
    }

    private async validateCustomScript(output: any, assertion: TaskAssertion, assertionId: string): Promise<AssertionResult> {
        // Custom script validation - executes a shell command or script
        const script = assertion.condition;

        try {
            // For security, we'll limit this to simple commands
            // In production, you might want to use a sandboxed environment
            const proc = Bun.spawn(['sh', '-c', script], {
                env: { ...process.env, TASK_OUTPUT: JSON.stringify(output) }
            });

            const exitCode = await proc.exited;
            const passed = exitCode === 0;

            return {
                assertion_id: assertionId,
                passed,
                message: assertion.message || `Custom script ${passed ? 'passed' : 'failed'} (exit code: ${exitCode})`,
                severity: assertion.severity,
                actual_value: exitCode,
                expected_value: 0
            };
        } catch (error) {
            return {
                assertion_id: assertionId,
                passed: false,
                message: `Custom script execution failed: ${error instanceof Error ? error.message : String(error)}`,
                severity: 'error'
            };
        }
    }

    // Phase 3: Save review results to database
    private async saveReviewResult(
        taskId: number,
        review: ReviewResult,
        model: string,
        criteria: string,
        reviewedOutput: string,
        assertionResults: AssertionResult[]
    ): Promise<void> {
        try {
            const db = getDatabase();

            // Enhance suggestions with assertion failures
            const enhancedSuggestions = [...(review.suggestions || [])];
            const failedAssertions = assertionResults.filter(r => !r.passed);

            if (failedAssertions.length > 0) {
                enhancedSuggestions.push(
                    `Failed assertions: ${failedAssertions.map(a => a.message).join('; ')}`
                );
            }

            db.run(`
                INSERT INTO review_results (
                    task_id, reviewer_type, model_used, passed, score,
                    feedback, suggestions, review_criteria, reviewed_output
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                taskId,
                'llm',
                model,
                review.passed,
                review.score || null,
                review.feedback,
                JSON.stringify(enhancedSuggestions),
                criteria,
                reviewedOutput.length > 5000 ? reviewedOutput.substring(0, 5000) + '...' : reviewedOutput
            ]);

            await logger.info('Review result saved to database', { taskId, passed: review.passed });
        } catch (error) {
            await logger.error('Failed to save review result', {
                taskId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}

// Export a singleton instance
export const reviewExecutor = new ReviewExecutor();