#!/usr/bin/env bun

/**
 * Manage Plan Templates CLI
 * 
 * This CLI tool manages plan templates for the LLM-based planning system.
 * It allows listing, searching, importing, exporting, and managing plan templates.
 * 
 * Usage:
 *   bun run manage-plan-templates --list --sort-by success_rate
 *   bun run manage-plan-templates --export templates-backup.json
 *   bun run manage-plan-templates --import templates.json --conflict-strategy merge
 */

import { parseArgs } from 'util';
import { logger } from '../utils/logger';
import { initDatabase, getDatabase } from '../db';
import type { PlanTemplate } from '../types/llm-planning';

interface CliArgs {
    'list'?: boolean;
    'search'?: string;
    'export'?: string;
    'import'?: string;
    'delete'?: number;
    'sort-by'?: 'name' | 'success_rate' | 'usage_count' | 'created_at';
    'filter-success-rate'?: number;
    'conflict-strategy'?: 'merge' | 'replace' | 'skip';
    'format'?: 'json' | 'table' | 'csv';
    'limit'?: number;
    'help'?: boolean;
}

async function main() {
    try {
        const { values } = parseArgs({
            args: process.argv.slice(2),
            options: {
                list: { type: 'boolean', short: 'l' },
                search: { type: 'string', short: 's' },
                export: { type: 'string', short: 'e' },
                import: { type: 'string', short: 'i' },
                delete: { type: 'string' },
                'sort-by': { type: 'string' },
                'filter-success-rate': { type: 'string' },
                'conflict-strategy': { type: 'string' },
                format: { type: 'string', short: 'f' },
                limit: { type: 'string' },
                help: { type: 'boolean', short: 'h' }
            },
            allowPositionals: true
        }) as { values: CliArgs };

        if (values.help) {
            showHelp();
            return;
        }

        // Initialize database
        await initDatabase();
        const db = getDatabase();
        
        await logger.info('🚀 Starting plan template management');

        // Handle different operations
        if (values.list) {
            await listTemplates(db, values);
        } else if (values.search) {
            await searchTemplates(db, values.search, values);
        } else if (values.export) {
            await exportTemplates(db, values.export, values);
        } else if (values.import) {
            await importTemplates(db, values.import, values);
        } else if (values.delete) {
            await deleteTemplate(db, parseInt(values.delete.toString()));
        } else {
            console.log('❌ No operation specified. Use --help for usage information.');
            process.exit(1);
        }

        await logger.info('✅ Plan template management completed');

    } catch (error) {
        console.error('❌ Error managing plan templates:', error);
        await logger.error('Failed to manage plan templates', {
            error: error instanceof Error ? error.message : String(error)
        });
        process.exit(1);
    }
}

async function listTemplates(db: any, options: CliArgs) {
    console.log('📋 Listing plan templates...');

    // Build query
    let query = 'SELECT * FROM plan_templates';
    let params: any[] = [];
    let whereConditions: string[] = [];

    // Add filters
    if (options['filter-success-rate']) {
        whereConditions.push('success_rate >= ?');
        params.push(parseFloat(options['filter-success-rate'].toString()));
    }

    if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
    }

    // Add sorting
    const sortBy = options['sort-by'] || 'created_at';
    const validSortColumns = ['name', 'success_rate', 'usage_count', 'created_at'];
    if (validSortColumns.includes(sortBy)) {
        query += ` ORDER BY ${sortBy} DESC`;
    }

    // Add limit
    if (options.limit) {
        query += ' LIMIT ?';
        params.push(parseInt(options.limit.toString()));
    }

    const templates = db.query(query).all(...params) as PlanTemplate[];

    if (templates.length === 0) {
        console.log('📭 No plan templates found.');
        return;
    }

    console.log(`\n📊 Found ${templates.length} plan templates:`);

    const format = options.format || 'table';
    
    switch (format) {
        case 'json':
            console.log(JSON.stringify(templates, null, 2));
            break;
        case 'csv':
            console.log('ID,Name,Description,Success Rate,Usage Count,Created At');
            templates.forEach(t => {
                console.log(`${t.id},"${t.name}","${t.description || ''}",${t.success_rate},${t.usage_count},${t.created_at}`);
            });
            break;
        case 'table':
        default:
            templates.forEach((template, index) => {
                console.log(`\n${index + 1}. ${template.name} (ID: ${template.id})`);
                console.log(`   📝 Description: ${template.description || 'No description'}`);
                console.log(`   📈 Success Rate: ${(template.success_rate * 100).toFixed(1)}%`);
                console.log(`   🔢 Usage Count: ${template.usage_count}`);
                console.log(`   📅 Created: ${new Date(template.created_at).toLocaleString()}`);
                console.log(`   📊 Template Size: ${template.template_data.length} characters`);
            });
            break;
    }
}

async function searchTemplates(db: any, searchTerm: string, options: CliArgs) {
    console.log(`🔍 Searching for templates matching: "${searchTerm}"`);

    const templates = db.query(`
        SELECT * FROM plan_templates 
        WHERE name LIKE ? OR description LIKE ?
        ORDER BY success_rate DESC
        LIMIT ?
    `).all(`%${searchTerm}%`, `%${searchTerm}%`, options.limit || 10) as PlanTemplate[];

    if (templates.length === 0) {
        console.log('📭 No matching templates found.');
        return;
    }

    console.log(`\n📊 Found ${templates.length} matching templates:`);
    
    templates.forEach((template, index) => {
        console.log(`\n${index + 1}. ${template.name} (ID: ${template.id})`);
        console.log(`   📝 Description: ${template.description || 'No description'}`);
        console.log(`   📈 Success Rate: ${(template.success_rate * 100).toFixed(1)}%`);
        console.log(`   🔢 Usage Count: ${template.usage_count}`);
    });
}

async function exportTemplates(db: any, outputFile: string, options: CliArgs) {
    console.log(`📤 Exporting plan templates to: ${outputFile}`);

    const templates = db.query('SELECT * FROM plan_templates ORDER BY created_at DESC').all() as PlanTemplate[];

    const exportData = {
        export_timestamp: new Date().toISOString(),
        template_count: templates.length,
        templates: templates.map(t => ({
            ...t,
            template_data: JSON.parse(t.template_data) // Parse JSON for better readability
        }))
    };

    await Bun.write(outputFile, JSON.stringify(exportData, null, 2));
    
    console.log(`✅ Exported ${templates.length} templates to ${outputFile}`);
}

async function importTemplates(db: any, inputFile: string, options: CliArgs) {
    console.log(`📥 Importing plan templates from: ${inputFile}`);

    try {
        const fileContent = await Bun.file(inputFile).text();
        const importData = JSON.parse(fileContent);
        
        if (!importData.templates || !Array.isArray(importData.templates)) {
            throw new Error('Invalid import file format. Expected { templates: [...] }');
        }

        const conflictStrategy = options['conflict-strategy'] || 'skip';
        let imported = 0;
        let skipped = 0;
        let updated = 0;

        for (const template of importData.templates) {
            // Check if template with same name exists
            const existing = db.query('SELECT id FROM plan_templates WHERE name = ?').get(template.name) as any;
            
            if (existing) {
                switch (conflictStrategy) {
                    case 'skip':
                        skipped++;
                        continue;
                    case 'replace':
                        db.run(`
                            UPDATE plan_templates 
                            SET description = ?, template_data = ?, success_rate = ?, usage_count = ?, updated_at = CURRENT_TIMESTAMP
                            WHERE name = ?
                        `, [
                            template.description,
                            JSON.stringify(template.template_data),
                            template.success_rate,
                            template.usage_count,
                            template.name
                        ]);
                        updated++;
                        break;
                    case 'merge':
                        // Merge by updating success rate and usage count
                        db.run(`
                            UPDATE plan_templates 
                            SET success_rate = (success_rate + ?) / 2, 
                                usage_count = usage_count + ?, 
                                updated_at = CURRENT_TIMESTAMP
                            WHERE name = ?
                        `, [template.success_rate, template.usage_count, template.name]);
                        updated++;
                        break;
                }
            } else {
                // Insert new template
                db.run(`
                    INSERT INTO plan_templates (name, description, template_data, success_rate, usage_count)
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    template.name,
                    template.description,
                    JSON.stringify(template.template_data),
                    template.success_rate || 0.5,
                    template.usage_count || 0
                ]);
                imported++;
            }
        }

        console.log(`✅ Import completed:`);
        console.log(`   📥 Imported: ${imported} new templates`);
        console.log(`   🔄 Updated: ${updated} existing templates`);
        console.log(`   ⏭️  Skipped: ${skipped} templates`);

    } catch (error) {
        throw new Error(`Failed to import templates: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function deleteTemplate(db: any, templateId: number) {
    console.log(`🗑️  Deleting template ID: ${templateId}`);

    // Check if template exists
    const template = db.query('SELECT name FROM plan_templates WHERE id = ?').get(templateId) as any;
    
    if (!template) {
        console.log('❌ Template not found.');
        return;
    }

    // Delete the template
    const result = db.run('DELETE FROM plan_templates WHERE id = ?', [templateId]);
    
    if (result.changes > 0) {
        console.log(`✅ Deleted template: ${template.name}`);
    } else {
        console.log('❌ Failed to delete template.');
    }
}

function showHelp() {
    console.log(`
📋 Manage Plan Templates - LLM-Based Planning System

USAGE:
  bun run manage-plan-templates [OPERATION] [OPTIONS]

OPERATIONS:
  -l, --list                       List all plan templates
  -s, --search <term>              Search templates by name or description
  -e, --export <file>              Export templates to JSON file
  -i, --import <file>              Import templates from JSON file
  --delete <id>                    Delete template by ID

OPTIONS:
  --sort-by <field>                Sort by: name, success_rate, usage_count, created_at
  --filter-success-rate <rate>     Filter by minimum success rate (0.0-1.0)
  --conflict-strategy <strategy>   Import conflict strategy: merge, replace, skip
  -f, --format <format>            Output format: json, table, csv (default: table)
  --limit <number>                 Limit number of results
  -h, --help                       Show this help message

EXAMPLES:
  # List all templates sorted by success rate
  bun run manage-plan-templates --list --sort-by success_rate

  # Search for templates containing "media"
  bun run manage-plan-templates --search "media" --limit 5

  # Export all templates
  bun run manage-plan-templates --export plan-templates-backup.json

  # Import templates with merge strategy
  bun run manage-plan-templates --import templates.json --conflict-strategy merge

  # List high-performing templates in CSV format
  bun run manage-plan-templates --list --filter-success-rate 0.8 --format csv
`);
}

if (import.meta.main) {
    main();
}
