#!/usr/bin/env node

/**
 * Test Script for Rule Scheduler Implementation
 *
 * This script validates the implementation without requiring a full runtime environment.
 */

const fs = require('fs');
const path = require('path');

class RuleSchedulerTester {
    constructor() {
        this.results = [];
    }

    async runAllTests() {
        console.log('🧪 Testing Rule Scheduler Implementation...\n');

        // Test file existence
        await this.testFileExistence();
        
        // Test type definitions
        await this.testTypeDefinitions();
        
        // Test migration structure
        await this.testMigrationStructure();
        
        // Test service structure
        await this.testServiceStructure();
        
        // Test CLI structure
        await this.testCLIStructure();
        
        // Test package.json updates
        await this.testPackageJsonUpdates();

        // Display results
        this.displayResults();
    }

    async testFileExistence() {
        const requiredFiles = [
            'src/types/rule-scheduler.ts',
            'src/migrations/011-add-rule-scheduler.ts',
            'src/services/pattern-detection-service.ts',
            'src/services/user-behavior-service.ts',
            'src/services/rule-generation-service.ts',
            'src/services/cron-optimization-service.ts',
            'src/services/predictive-scheduler-service.ts',
            'src/services/resource-optimizer-service.ts',
            'src/cli/analyze-activity-patterns.ts',
            'src/cli/view-detected-patterns.ts',
            'src/cli/generate-scheduling-rules.ts',
            'src/cli/optimize-resource-schedule.ts',
            'src/cli/search-similar-patterns.ts'
        ];

        for (const file of requiredFiles) {
            const exists = fs.existsSync(file);
            this.results.push({
                name: `File exists: ${file}`,
                passed: exists,
                message: exists ? 'File found' : 'File missing'
            });
        }
    }

    async testTypeDefinitions() {
        try {
            const typeFile = 'src/types/rule-scheduler.ts';
            const content = fs.readFileSync(typeFile, 'utf8');
            
            const requiredTypes = [
                'ActivityPattern',
                'SchedulingRule',
                'RuleAction',
                'UserBehaviorProfile',
                'PredictiveSchedule',
                'OptimizationResult',
                'RuleSchedulerConfig'
            ];

            for (const type of requiredTypes) {
                const hasType = content.includes(`interface ${type}`) || content.includes(`type ${type}`);
                this.results.push({
                    name: `Type definition: ${type}`,
                    passed: hasType,
                    message: hasType ? 'Type defined' : 'Type missing'
                });
            }

            // Check for default config
            const hasDefaultConfig = content.includes('DEFAULT_RULE_SCHEDULER_CONFIG');
            this.results.push({
                name: 'Default configuration',
                passed: hasDefaultConfig,
                message: hasDefaultConfig ? 'Default config found' : 'Default config missing'
            });

        } catch (error) {
            this.results.push({
                name: 'Type definitions test',
                passed: false,
                message: `Error reading type file: ${error}`
            });
        }
    }

    async testMigrationStructure() {
        try {
            const migrationFile = 'src/migrations/011-add-rule-scheduler.ts';
            const content = fs.readFileSync(migrationFile, 'utf8');
            
            const requiredTables = [
                'activity_patterns',
                'scheduling_rules',
                'rule_actions',
                'predictive_schedules',
                'optimization_results',
                'user_behavior_profiles'
            ];

            for (const table of requiredTables) {
                const hasTable = content.includes(`CREATE TABLE IF NOT EXISTS ${table}`);
                this.results.push({
                    name: `Migration table: ${table}`,
                    passed: hasTable,
                    message: hasTable ? 'Table creation found' : 'Table creation missing'
                });
            }

            // Check for migration class
            const hasMigrationClass = content.includes('class RuleSchedulerMigration');
            this.results.push({
                name: 'Migration class structure',
                passed: hasMigrationClass,
                message: hasMigrationClass ? 'Migration class found' : 'Migration class missing'
            });

        } catch (error) {
            this.results.push({
                name: 'Migration structure test',
                passed: false,
                message: `Error reading migration file: ${error}`
            });
        }
    }

    async testServiceStructure() {
        const services = [
            {
                file: 'src/services/pattern-detection-service.ts',
                className: 'PatternDetectionService',
                methods: ['analyzeActivityPatterns', 'detectDailyPatterns', 'detectWeeklyPatterns']
            },
            {
                file: 'src/services/user-behavior-service.ts',
                className: 'UserBehaviorService',
                methods: ['analyzeUserBehavior', 'predictUserBehavior', 'generateBehaviorPatterns']
            },
            {
                file: 'src/services/rule-generation-service.ts',
                className: 'RuleGenerationService',
                methods: ['generateRulesFromPatterns', 'generateRulesForPattern', 'detectRuleConflicts']
            },
            {
                file: 'src/services/cron-optimization-service.ts',
                className: 'CronOptimizationService',
                methods: ['generateOptimizedCronExpression', 'validateAndImprove']
            },
            {
                file: 'src/services/predictive-scheduler-service.ts',
                className: 'PredictiveSchedulerService',
                methods: ['generatePredictiveSchedules', 'predictTasksForTimeSlot', 'estimateResourceRequirements']
            },
            {
                file: 'src/services/resource-optimizer-service.ts',
                className: 'ResourceOptimizerService',
                methods: ['optimizeResourceSchedule', 'applyLoadBalancing', 'calculateImprovements']
            }
        ];

        for (const service of services) {
            try {
                const content = fs.readFileSync(service.file, 'utf8');
                
                // Check class exists
                const hasClass = content.includes(`class ${service.className}`);
                this.results.push({
                    name: `Service class: ${service.className}`,
                    passed: hasClass,
                    message: hasClass ? 'Class found' : 'Class missing'
                });

                // Check methods exist
                for (const method of service.methods) {
                    const hasMethod = content.includes(`${method}(`);
                    this.results.push({
                        name: `Service method: ${service.className}.${method}`,
                        passed: hasMethod,
                        message: hasMethod ? 'Method found' : 'Method missing'
                    });
                }

            } catch (error) {
                this.results.push({
                    name: `Service structure: ${service.className}`,
                    passed: false,
                    message: `Error reading service file: ${error}`
                });
            }
        }
    }

    async testCLIStructure() {
        const cliCommands = [
            {
                file: 'src/cli/analyze-activity-patterns.ts',
                name: 'analyze-activity-patterns',
                hasHelp: true
            },
            {
                file: 'src/cli/view-detected-patterns.ts',
                name: 'view-detected-patterns',
                hasHelp: true
            },
            {
                file: 'src/cli/generate-scheduling-rules.ts',
                name: 'generate-scheduling-rules',
                hasHelp: true
            },
            {
                file: 'src/cli/optimize-resource-schedule.ts',
                name: 'optimize-resource-schedule',
                hasHelp: true
            },
            {
                file: 'src/cli/search-similar-patterns.ts',
                name: 'search-similar-patterns',
                hasHelp: true
            }
        ];

        for (const cli of cliCommands) {
            try {
                const content = fs.readFileSync(cli.file, 'utf8');
                
                // Check shebang
                const hasShebang = content.startsWith('#!/usr/bin/env bun');
                this.results.push({
                    name: `CLI shebang: ${cli.name}`,
                    passed: hasShebang,
                    message: hasShebang ? 'Shebang found' : 'Shebang missing'
                });

                // Check parseArgs usage
                const hasParseArgs = content.includes('parseArgs');
                this.results.push({
                    name: `CLI argument parsing: ${cli.name}`,
                    passed: hasParseArgs,
                    message: hasParseArgs ? 'Argument parsing found' : 'Argument parsing missing'
                });

                // Check help function
                if (cli.hasHelp) {
                    const hasHelpFunction = content.includes('function showHelp');
                    this.results.push({
                        name: `CLI help function: ${cli.name}`,
                        passed: hasHelpFunction,
                        message: hasHelpFunction ? 'Help function found' : 'Help function missing'
                    });
                }

            } catch (error) {
                this.results.push({
                    name: `CLI structure: ${cli.name}`,
                    passed: false,
                    message: `Error reading CLI file: ${error}`
                });
            }
        }
    }

    async testPackageJsonUpdates() {
        try {
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            
            const expectedScripts = [
                'analyze-activity-patterns',
                'view-detected-patterns',
                'generate-scheduling-rules',
                'optimize-resource-schedule',
                'search-similar-patterns'
            ];

            for (const script of expectedScripts) {
                const hasScript = packageJson.scripts && packageJson.scripts[script];
                this.results.push({
                    name: `Package.json script: ${script}`,
                    passed: !!hasScript,
                    message: hasScript ? 'Script found' : 'Script missing'
                });
            }

        } catch (error) {
            this.results.push({
                name: 'Package.json updates test',
                passed: false,
                message: `Error reading package.json: ${error}`
            });
        }
    }

    displayResults() {
        console.log('\n📊 TEST RESULTS:');
        console.log('═'.repeat(80));

        const passed = this.results.filter(r => r.passed).length;
        const total = this.results.length;
        const percentage = Math.round((passed / total) * 100);

        // Group results by category
        const categories = {
            'File Existence': this.results.filter(r => r.name.startsWith('File exists')),
            'Type Definitions': this.results.filter(r => r.name.startsWith('Type definition') || r.name.includes('Default configuration')),
            'Migration Structure': this.results.filter(r => r.name.startsWith('Migration')),
            'Service Structure': this.results.filter(r => r.name.startsWith('Service')),
            'CLI Structure': this.results.filter(r => r.name.startsWith('CLI')),
            'Package Updates': this.results.filter(r => r.name.startsWith('Package.json'))
        };

        for (const [category, tests] of Object.entries(categories)) {
            if (tests.length === 0) continue;
            
            console.log(`\n📂 ${category}:`);
            for (const test of tests) {
                const icon = test.passed ? '✅' : '❌';
                console.log(`   ${icon} ${test.name}: ${test.message}`);
            }
        }

        console.log('\n📈 SUMMARY:');
        console.log(`   Tests passed: ${passed}/${total} (${percentage}%)`);
        
        if (percentage === 100) {
            console.log('   🎉 All tests passed! Implementation looks good.');
        } else if (percentage >= 80) {
            console.log('   ✅ Most tests passed. Minor issues detected.');
        } else {
            console.log('   ⚠️  Some tests failed. Review implementation.');
        }

        console.log('\n🚀 NEXT STEPS:');
        console.log('   1. Run database migration: bun run migrate');
        console.log('   2. Test pattern analysis: bun run analyze-activity-patterns --help');
        console.log('   3. View detected patterns: bun run view-detected-patterns --help');
        console.log('   4. Generate rules: bun run generate-scheduling-rules --help');
        
        if (passed < total) {
            console.log('   5. Fix failing tests and re-run validation');
        }
    }
}

// Run the tests
const tester = new RuleSchedulerTester();
tester.runAllTests().catch(console.error);
