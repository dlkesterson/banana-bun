import { describe, it, expect } from 'bun:test';
import { plannerService } from '../src/services/planner-service';

describe('PlannerService Badge Helpers', () => {
    describe('getContextUsageBadge', () => {
        it('handles empty or null values', () => {
            const expected = '<span class="px-2 py-1 text-xs bg-gray-400 text-white rounded">No Context</span>';
            expect(plannerService.getContextUsageBadge(null)).toBe(expected);
            expect(plannerService.getContextUsageBadge('[]')).toBe(expected);
        });

        it('renders counts correctly', () => {
            const one = '<span class="px-2 py-1 text-xs bg-blue-500 text-white rounded">1 Similar</span>';
            expect(plannerService.getContextUsageBadge('["a"]')).toBe(one);

            const many = '<span class="px-2 py-1 text-xs bg-green-500 text-white rounded">3 Similar</span>';
            expect(plannerService.getContextUsageBadge('["a","b","c"]')).toBe(many);
        });

        it('handles invalid JSON input', () => {
            const invalid = '<span class="px-2 py-1 text-xs bg-gray-400 text-white rounded">Invalid</span>';
            expect(plannerService.getContextUsageBadge('not-json')).toBe(invalid);
        });
    });

    describe('getSubtaskCountBadge', () => {
        it('returns color based on subtask count', () => {
            const none = '<span class="px-2 py-1 text-xs bg-gray-400 text-white rounded">0 tasks</span>';
            const few = '<span class="px-2 py-1 text-xs bg-green-500 text-white rounded">2 tasks</span>';
            const some = '<span class="px-2 py-1 text-xs bg-blue-500 text-white rounded">5 tasks</span>';
            const many = '<span class="px-2 py-1 text-xs bg-orange-500 text-white rounded">8 tasks</span>';

            expect(plannerService.getSubtaskCountBadge(0)).toBe(none);
            expect(plannerService.getSubtaskCountBadge(2)).toBe(few);
            expect(plannerService.getSubtaskCountBadge(5)).toBe(some);
            expect(plannerService.getSubtaskCountBadge(8)).toBe(many);
        });
    });
});
