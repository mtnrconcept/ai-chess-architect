import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[migrate] Missing SUPABASE_URL or SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function migrateRules() {
  console.log('[migrate] Loading legacy rules...');
  
  try {
    // Charger dynamiquement les règles
    const rulesModule = await import('../src/lib/presetRules.ts');
    const allRules = rulesModule.allPresetRules;

    console.log(`[migrate] Found ${allRules.length} legacy rules`);

    let success = 0, failed = 0, skipped = 0;
    const reports = [];

    for (const rule of allRules) {
      // Import du convertisseur (simulé ici car dépendance TypeScript)
      // En production, il faudrait compiler le convertisseur en JS
      
      // Pour l'instant, on va juste insérer les règles legacy telles quelles
      // avec un flag is_functional = false
      
      const { data: existing, error: checkError } = await supabase
        .from('preset_rules')
        .select('rule_id')
        .eq('rule_id', rule.ruleId)
        .single();

      if (existing && !checkError) {
        console.log(`[migrate] Rule ${rule.ruleId} already exists, skipping`);
        skipped++;
        continue;
      }

      const { error } = await supabase.from('preset_rules').insert({
        rule_id: rule.ruleId,
        rule_name: rule.ruleName,
        description: rule.description,
        category: rule.category,
        rule_json: {
          meta: {
            ruleId: rule.ruleId,
            ruleName: rule.ruleName,
            description: rule.description,
            category: rule.category,
            version: '1.0.0',
            isActive: rule.isActive !== false,
            tags: rule.tags || []
          },
          scope: {
            affectedPieces: rule.affectedPieces,
            sides: ['white', 'black']
          },
          logic: {
            effects: []
          }
        },
        is_functional: false,
        tags: rule.tags || [],
        validation_notes: 'Legacy rule - needs conversion',
        version: '1.0.0'
      });

      if (error) {
        console.error(`[migrate] Failed to insert ${rule.ruleId}:`, error.message);
        failed++;
      } else {
        console.log(`[migrate] ✓ Migrated ${rule.ruleId}`);
        success++;
      }
    }

    console.log(`\n[migrate] Migration complete:`);
    console.log(`  - Success: ${success}`);
    console.log(`  - Failed: ${failed}`);
    console.log(`  - Skipped: ${skipped}`);
    console.log(`  - Total: ${allRules.length}`);
    
  } catch (error) {
    console.error('[migrate] Migration failed:', error);
    process.exit(1);
  }
}

migrateRules().catch(console.error);
