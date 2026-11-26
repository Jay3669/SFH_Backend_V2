import test from 'node:test';
import assert from 'node:assert/strict';
import { Permission, Role, RolePermission } from '../src/models/auth.model.js';
import { ensureAuthenticationSeedData } from '../src/services/authService.js';

test('seeds authentication permissions with a single idempotent bulk insert', async (t) => {
    const calls = [];

    t.mock.method(Role, 'bulkCreate', async (...args) => {
        calls.push(['roles', ...args]);
    });
    t.mock.method(Permission, 'bulkCreate', async (...args) => {
        calls.push(['permissions', ...args]);
    });
    t.mock.method(Permission, 'findOrCreate', async () => {
        throw new Error('Permission seeding should not open per-row transactions.');
    });
    t.mock.method(RolePermission, 'bulkCreate', async (...args) => {
        calls.push(['rolePermissions', ...args]);
    });

    await ensureAuthenticationSeedData();

    const permissionCall = calls.find(([name]) => name === 'permissions');
    assert.ok(permissionCall);
    assert.ok(permissionCall[1].length > 0);
    assert.ok(permissionCall[1].every(({ id, description }) => id && description));
    assert.deepEqual(permissionCall[2], { ignoreDuplicates: true });
    assert.ok(calls.findIndex(([name]) => name === 'permissions') <
        calls.findIndex(([name]) => name === 'rolePermissions'));
});
