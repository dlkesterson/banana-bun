import { mcpManager } from './mcp-manager.js';
import { mcpClient } from './mcp-client.js';

async function searchTaskLogs() {
    // Initialize MCP servers if not already running
    await mcpManager.initialize();

    try {
        // Search for tasks with S3 sync in the description
        const searchResults = await mcpClient.sendCustomRequest('chromadb', 'tools/call', {
            name: 'search_by_metadata',
            arguments: {
                metadata_filters: {
                    type: "tool"
                },
                similarity_query: "s3 sync batch error",
                limit: 5
            }
        });

        console.log('Search results:', JSON.parse(searchResults.content[0].text));

        // Also check for similar tasks that might have succeeded
        const similarTasks = await mcpManager.findSimilarTasks("s3 sync batch", { limit: 5 });
        console.log('Similar tasks:', similarTasks);
    } catch (error) {
        console.error('Error searching logs:', error);
    } finally {
        // Shutdown MCP servers when done
        await mcpManager.shutdown();
    }
}

// Export the function for testing
export { searchTaskLogs as searchLogs };

// Run if called directly
if (import.meta.main) {
    searchTaskLogs().catch(console.error);
}