import test from 'node:test';
import assert from 'node:assert/strict';
import { Op, col, fn, where } from 'sequelize';
import { applyBranchScope, getBranchId, runWithBranchContext } from '../src/utils/branchContext.js';

test('branch scope preserves existing filters and scopes nested associations', () => {
    const categoryModel = { rawAttributes: { branchId: {} } };
    const itemModel = { rawAttributes: { branchId: {} } };
    const options = {
        where: { isActive: true },
        include: [{ model: categoryModel, where: { isActive: true } }],
    };

    runWithBranchContext('branch-a', () => applyBranchScope(options, itemModel));

    assert.deepEqual(options.where, {
        [Op.and]: [{ isActive: true }, { branchId: 'branch-a' }],
    });
    assert.deepEqual(options.include[0].where, {
        [Op.and]: [{ isActive: true }, { branchId: 'branch-a' }],
    });
    assert.equal(options.include[0].required, true);
});

test('branch scope preserves Sequelize where expressions', () => {
    const categoryModel = { rawAttributes: { branchId: {} } };
    const predicate = where(fn('lower', col('name')), 'fruits');
    const options = { where: predicate };

    runWithBranchContext('branch-a', () => applyBranchScope(options, categoryModel));

    assert.equal(options.where[Op.and][0], predicate);
    assert.deepEqual(options.where[Op.and][1], { branchId: 'branch-a' });
});

test('branch scope does not make an optional included association required', () => {
    const itemModel = { rawAttributes: { branchId: {} } };
    const categoryModel = { rawAttributes: { branchId: {} } };
    const include = { model: categoryModel };
    const options = { include: [include] };

    runWithBranchContext('branch-a', () => applyBranchScope(options, itemModel));

    assert.equal(include.required, false);
    assert.deepEqual(include.where, { branchId: 'branch-a' });
});

test('branch context stays isolated between concurrent requests', async () => {
    const readBranchAfterYield = (branchId) => runWithBranchContext(branchId, async () => {
        await new Promise((resolve) => setImmediate(resolve));
        return getBranchId();
    });

    assert.deepEqual(
        await Promise.all([readBranchAfterYield('branch-a'), readBranchAfterYield('branch-b')]),
        ['branch-a', 'branch-b'],
    );
    assert.equal(getBranchId(), undefined);
});
