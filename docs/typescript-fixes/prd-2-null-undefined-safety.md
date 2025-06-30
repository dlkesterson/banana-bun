# PRD 2: Null/Undefined Safety and Optional Chaining

## Problem Statement

Widespread null/undefined safety issues are causing TypeScript errors throughout the codebase:

1. **Array Access Without Bounds Checking**: Accessing array elements that might not exist
2. **Object Property Access**: Accessing properties on potentially undefined objects
3. **Function Parameter Validation**: Functions receiving undefined values for required string/number parameters
4. **Database Query Results**: Assuming database queries always return results

## Root Cause Analysis

### Current Issues Found:
- 18+ errors in `src/cli/media-search.ts` - accessing properties on potentially undefined objects
- 15+ errors in `src/cli/download-media.ts` - undefined argument handling
- 6+ errors in `src/cli/banana-audio-analyze.ts` - Object.entries on unknown types
- Multiple CLI tools have parseInt/parseFloat on potentially undefined strings
- Database query results assumed to be non-null

### Core Problems:
1. **Insufficient Input Validation**: CLI argument parsing doesn't validate existence
2. **Missing Null Checks**: Database and API results not checked for null/undefined
3. **Array Bounds**: Accessing array indices without checking length
4. **Type Assertions**: Using `as` casting instead of proper type guards

## Proposed Solution

### Phase 1: Input Validation Framework
1. **CLI Argument Parser**: Robust argument parsing with validation
   ```typescript
   function parseCliArgs(args: string[]): ParsedArgs {
     // Validate all required arguments exist
     // Provide clear error messages for missing args
   }
   ```

2. **Database Result Validation**: Always check query results
   ```typescript
   const result = db.query(sql);
   if (!result || result.length === 0) {
     throw new Error('No results found');
   }
   ```

### Phase 2: Safe Access Patterns
1. **Optional Chaining**: Use `?.` operator consistently
2. **Nullish Coalescing**: Use `??` for default values
3. **Type Guards**: Create utility functions for common checks
   ```typescript
   function isValidString(value: unknown): value is string {
     return typeof value === 'string' && value.length > 0;
   }
   ```

### Phase 3: Array and Object Safety
1. **Safe Array Access**: Utility functions for array operations
   ```typescript
   function safeArrayAccess<T>(arr: T[], index: number): T | undefined {
     return index >= 0 && index < arr.length ? arr[index] : undefined;
   }
   ```

2. **Object Property Validation**: Check properties before access
3. **Type-Safe Object.entries**: Handle unknown object types properly

## Specific Fixes Needed

### CLI Tools
- `download-media.ts`: Validate all argument parsing
- `media-search.ts`: Add null checks for search results
- `banana-audio-analyze.ts`: Handle unknown object types in stats
- All CLI tools: Validate parseInt/parseFloat inputs

### Database Operations
- Add result validation for all queries
- Handle empty result sets gracefully
- Type database row results properly

### Service Layer
- Validate service method parameters
- Handle API response edge cases
- Add defensive programming patterns

## Success Criteria

- [ ] All null/undefined TypeScript errors resolved
- [ ] CLI tools handle missing arguments gracefully
- [ ] Database operations never assume non-null results
- [ ] Array access is bounds-checked
- [ ] Object property access is safe
- [ ] Clear error messages for invalid inputs

## Implementation Priority

**High Priority**: These errors are blocking CI and could cause runtime crashes

## Dependencies

- May require updates to CLI help text and documentation
- Database schema might need nullable field clarification
- Error handling strategy needs to be consistent

## Estimated Effort

**Medium** - Many small fixes across multiple files, but each fix is relatively straightforward
