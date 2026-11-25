const UNIT_DEFINITIONS = {
    kg: { dimension: 'mass', factor: 1_000_000_000n },
    g: { dimension: 'mass', factor: 1_000_000n },
    mg: { dimension: 'mass', factor: 1_000n },
    lb: { dimension: 'mass', factor: 453_592_370n },
    oz: { dimension: 'mass', factor: 28_349_523n },
    l: { dimension: 'volume', factor: 1_000_000_000n },
    ml: { dimension: 'volume', factor: 1_000_000n },
    cl: { dimension: 'volume', factor: 10_000_000n },
    cup: { dimension: 'volume', factor: 236_588_000n },
    tbsp: { dimension: 'volume', factor: 14_787_000n },
    tsp: { dimension: 'volume', factor: 4_929_000n },
    piece: { dimension: 'count', factor: 1_000_000n },
    pieces: { dimension: 'count', factor: 1_000_000n },
    pc: { dimension: 'count', factor: 1_000_000n },
    pcs: { dimension: 'count', factor: 1_000_000n },
    each: { dimension: 'count', factor: 1_000_000n },
    plate: { dimension: 'count', factor: 1_000_000n },
    portion: { dimension: 'count', factor: 1_000_000n },
    packet: { dimension: 'count', factor: 1_000_000n },
};

const DECIMAL_PATTERN = /^(\d{1,12})(?:\.(\d+))?$/;
const MAX_MONEY_CENTS = 99_999_999_999_999n;
const MAX_QUANTITY_MILLI = 99_999_999_999_999n;

export class ProductionMathError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProductionMathError';
    }
}

export const normalizeUnit = (unit) => {
    if (typeof unit !== 'string') throw new ProductionMathError('A valid unit is required.');
    const normalized = unit.trim().toLowerCase();
    if (!UNIT_DEFINITIONS[normalized]) {
        throw new ProductionMathError(`Unsupported unit "${unit}".`);
    }
    return normalized;
};

export const getUnitDimension = (unit) => UNIT_DEFINITIONS[normalizeUnit(unit)].dimension;

export const toScaledInteger = (value, decimalPlaces, label = 'Value') => {
    const source = typeof value === 'number' && Number.isFinite(value)
        ? String(value)
        : typeof value === 'string' ? value.trim() : '';
    const match = DECIMAL_PATTERN.exec(source);
    if (!match || match[2]?.length > decimalPlaces) {
        throw new ProductionMathError(`${label} must be a non-negative number with at most ${decimalPlaces} decimal places.`);
    }
    const scale = 10n ** BigInt(decimalPlaces);
    const fraction = (match[2] || '').padEnd(decimalPlaces, '0');
    return BigInt(match[1]) * scale + BigInt(fraction || '0');
};

export const scaledIntegerToNumber = (value, decimalPlaces) =>
    Number(value) / (10 ** decimalPlaces);

const roundDivide = (numerator, denominator) => {
    if (denominator <= 0n) throw new ProductionMathError('A positive divisor is required.');
    return (numerator + denominator / 2n) / denominator;
};

export const convertQuantity = (quantity, fromUnit, toUnit) => {
    const from = normalizeUnit(fromUnit);
    const to = normalizeUnit(toUnit);
    const fromDefinition = UNIT_DEFINITIONS[from];
    const toDefinition = UNIT_DEFINITIONS[to];
    if (fromDefinition.dimension !== toDefinition.dimension) {
        throw new ProductionMathError(`Cannot convert ${from} to ${to}.`);
    }
    const quantityMilli = toScaledInteger(quantity, 3, 'Quantity');
    const convertedMilli = roundDivide(quantityMilli * fromDefinition.factor, toDefinition.factor);
    return scaledIntegerToNumber(convertedMilli, 3);
};

export const calculateProductionScaling = ({
    baseProductionQuantity,
    baseProductionUnit,
    requestedQuantity,
    requestedUnit = baseProductionUnit,
    expectedPlateCount,
    recipeWastagePercentage = 0,
    ingredients,
}) => {
    const baseUnit = normalizeUnit(baseProductionUnit);
    const requestedNormalizedUnit = normalizeUnit(requestedUnit);
    const baseDefinition = UNIT_DEFINITIONS[baseUnit];
    const requestedDefinition = UNIT_DEFINITIONS[requestedNormalizedUnit];
    if (baseDefinition.dimension !== requestedDefinition.dimension) {
        throw new ProductionMathError('Production quantity unit must match the recipe production unit.');
    }

    const baseQuantityMilli = toScaledInteger(baseProductionQuantity, 3, 'Base production quantity');
    const requestedQuantityMilli = toScaledInteger(requestedQuantity, 3, 'Production quantity');
    const baseCanonical = baseQuantityMilli * baseDefinition.factor;
    const requestedCanonical = requestedQuantityMilli * requestedDefinition.factor;
    if (baseCanonical <= 0n || requestedCanonical <= 0n) {
        throw new ProductionMathError('Production quantities must be greater than zero.');
    }

    const plateCountMilli = toScaledInteger(expectedPlateCount, 3, 'Expected plate count');
    const expectedPlateCountMilli = roundDivide(plateCountMilli * requestedCanonical, baseCanonical);
    if (expectedPlateCountMilli < 1n || expectedPlateCountMilli > MAX_QUANTITY_MILLI) {
        throw new ProductionMathError('Scaled expected plate count is outside the supported quantity range.');
    }
    const recipeWastageBasisPoints = toScaledInteger(recipeWastagePercentage, 2, 'Recipe wastage percentage');
    if (recipeWastageBasisPoints > 10_000n) {
        throw new ProductionMathError('Recipe wastage percentage cannot exceed 100.');
    }

    const scaledIngredients = ingredients.map((ingredient) => {
        const ingredientUnit = normalizeUnit(ingredient.unit);
        const stockUnit = normalizeUnit(ingredient.stockUnit);
        const ingredientDefinition = UNIT_DEFINITIONS[ingredientUnit];
        const stockDefinition = UNIT_DEFINITIONS[stockUnit];
        if (ingredientDefinition.dimension !== stockDefinition.dimension) {
            throw new ProductionMathError(`Ingredient unit ${ingredientUnit} cannot be converted to stock unit ${stockUnit}.`);
        }
        const ingredientQuantityMilli = toScaledInteger(ingredient.quantity, 3, 'Ingredient quantity');
        if (ingredientQuantityMilli <= 0n) {
            throw new ProductionMathError('Ingredient quantities must be greater than zero.');
        }
        const quantityInStockUnitMilli = roundDivide(
            ingredientQuantityMilli * ingredientDefinition.factor,
            stockDefinition.factor,
        );
        if (quantityInStockUnitMilli < 1n) {
            throw new ProductionMathError('Ingredient quantity is below the stock unit precision.');
        }
        const theoreticalMilli = roundDivide(
            quantityInStockUnitMilli * requestedCanonical,
            baseCanonical,
        );
        if (theoreticalMilli < 1n || theoreticalMilli > MAX_QUANTITY_MILLI) {
            throw new ProductionMathError('Scaled ingredient quantity is outside the supported stock precision.');
        }
        const ingredientWastageBasisPoints = toScaledInteger(
            ingredient.wastagePercentage || 0,
            2,
            'Ingredient wastage percentage',
        );
        if (ingredientWastageBasisPoints > 10_000n) {
            throw new ProductionMathError('Ingredient wastage percentage cannot exceed 100.');
        }
        const withRecipeWastage = roundDivide(
            theoreticalMilli * (10_000n + recipeWastageBasisPoints),
            10_000n,
        );
        const deductedMilli = roundDivide(
            withRecipeWastage * (10_000n + ingredientWastageBasisPoints),
            10_000n,
        );
        if (deductedMilli > MAX_QUANTITY_MILLI) {
            throw new ProductionMathError('Ingredient quantity with wastage exceeds the supported stock range.');
        }
        const unitCostCents = toScaledInteger(ingredient.unitCost, 2, 'Stock unit cost');
        const totalCostCents = roundDivide(deductedMilli * unitCostCents, 1_000n);
        if (totalCostCents > MAX_MONEY_CENTS) {
            throw new ProductionMathError('Ingredient cost exceeds the supported monetary range.');
        }
        return {
            theoreticalQuantity: scaledIntegerToNumber(theoreticalMilli, 3),
            quantityDeducted: scaledIntegerToNumber(deductedMilli, 3),
            unit: stockUnit,
            unitCost: scaledIntegerToNumber(unitCostCents, 2),
            totalCost: scaledIntegerToNumber(totalCostCents, 2),
            totalCostCents,
            balanceAfterMilli: toScaledInteger(ingredient.balance, 3, 'Stock balance') - deductedMilli,
            stockBalance: scaledIntegerToNumber(toScaledInteger(ingredient.balance, 3, 'Stock balance'), 3),
        };
    });

    return {
        productionQuantity: scaledIntegerToNumber(requestedQuantityMilli, 3),
        productionUnit: requestedNormalizedUnit,
        expectedPlateCount: scaledIntegerToNumber(expectedPlateCountMilli, 3),
        expectedPlateCountMilli,
        recipeWastageBasisPoints,
        ingredients: scaledIngredients,
        baseCanonical,
        requestedCanonical,
    };
};

export const calculateProductionCosts = ({
    ingredients,
    additionalCosts = [],
    productionQuantity,
    productionUnit,
    expectedPlateCount,
}) => {
    const ingredientCostCents = ingredients.reduce(
        (total, ingredient) => total + toScaledInteger(ingredient.totalCost, 2, 'Ingredient cost'),
        0n,
    );
    const additionalCostCents = additionalCosts.reduce(
        (total, cost) => total + toScaledInteger(cost.amount, 2, 'Additional cost'),
        0n,
    );
    const totalCostCents = ingredientCostCents + additionalCostCents;
    if (totalCostCents > MAX_MONEY_CENTS) {
        throw new ProductionMathError('Production cost exceeds the supported monetary range.');
    }
    const plateCountMilli = toScaledInteger(expectedPlateCount, 3, 'Expected plate count');
    const costPerPlateCents = plateCountMilli > 0n
        ? roundDivide(totalCostCents * 1_000n, plateCountMilli)
        : 0n;

    let costPerKg = null;
    const normalizedProductionUnit = normalizeUnit(productionUnit);
    if (UNIT_DEFINITIONS[normalizedProductionUnit].dimension === 'mass') {
        const quantityMilli = toScaledInteger(productionQuantity, 3, 'Production quantity');
        const kilogramsMilli = roundDivide(
            quantityMilli * UNIT_DEFINITIONS[normalizedProductionUnit].factor,
            UNIT_DEFINITIONS.kg.factor,
        );
        if (kilogramsMilli > 0n) {
            const costPerKgCents = roundDivide(totalCostCents * 1_000n, kilogramsMilli);
            if (costPerKgCents > MAX_MONEY_CENTS) {
                throw new ProductionMathError('Cost per kilogram exceeds the supported monetary range.');
            }
            costPerKg = scaledIntegerToNumber(costPerKgCents, 2);
        }
    }
    if (costPerPlateCents > MAX_MONEY_CENTS) {
        throw new ProductionMathError('Cost per plate exceeds the supported monetary range.');
    }

    return {
        totalIngredientCost: scaledIntegerToNumber(ingredientCostCents, 2),
        additionalCost: scaledIntegerToNumber(additionalCostCents, 2),
        totalProductionCost: scaledIntegerToNumber(totalCostCents, 2),
        costPerKg,
        costPerPlate: scaledIntegerToNumber(costPerPlateCents, 2),
    };
};
