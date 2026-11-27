import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureCodeSequences } from '../src/services/codeSequenceService.js';

const missingSequenceState = {
    table_0_exists: false,
    sequence_0_exists: false,
    table_1_exists: false,
    sequence_1_exists: false,
    table_2_exists: false,
    sequence_2_exists: false,
    table_3_exists: false,
    sequence_3_exists: false,
};

test('creates missing stock and menu code sequences before sync for new tables', async () => {
    const createdSequences = [];
    const database = {
        sequelize: {
            async query(sql) {
                if (sql.startsWith('SELECT')) return [missingSequenceState];
                createdSequences.push(sql);
                return [];
            },
        },
    };

    await ensureCodeSequences(database, 'public');

    assert.deepEqual(createdSequences, [
        'CREATE SEQUENCE "public"."stock_category_code_seq" AS bigint',
        'CREATE SEQUENCE "public"."stock_item_code_seq" AS bigint',
        'CREATE SEQUENCE "public"."menu_category_code_seq" AS bigint',
        'CREATE SEQUENCE "public"."menu_item_code_seq" AS bigint',
    ]);
});

test('requires the menu code migration when an existing menu table lacks its sequence', async () => {
    const state = {
        ...missingSequenceState,
        sequence_0_exists: true,
        sequence_1_exists: true,
        table_2_exists: true,
    };
    const database = {
        sequelize: {
            async query(sql) {
                if (sql.startsWith('SELECT')) return [state];
                assert.fail('Must not create a sequence for an existing table');
            },
        },
    };

    await assert.rejects(
        ensureCodeSequences(database, 'public'),
        /Missing public\.menu_category_code_seq; run npm run migrate:024 with DB_SCHEMA=public/,
    );
});
