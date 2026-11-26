export function resolveDatabaseSettings(env = process.env) {
    const requestedProfile = typeof env.DB_ENV === 'string'
        ? env.DB_ENV.trim().toLowerCase()
        : '';

    if (requestedProfile && requestedProfile !== 'local' && requestedProfile !== 'production') {
        throw new Error('DB_ENV must be either "local" or "production".');
    }

    const profilePrefix = requestedProfile
        ? `${requestedProfile.toUpperCase()}_DB_`
        : '';
    const profileUrlKey = requestedProfile
        ? `${requestedProfile.toUpperCase()}_DATABASE_URL`
        : '';
    const hasProfileSettings = Boolean(requestedProfile) && (
        Object.keys(env).some((key) => key.startsWith(profilePrefix))
        || env[profileUrlKey] !== undefined
    );
    const useLegacySettings = !requestedProfile
        || (requestedProfile === 'production' && !hasProfileSettings);

    const readSetting = (key) => {
        if (hasProfileSettings) {
            return env[`${profilePrefix}${key}`];
        }
        if (useLegacySettings) {
            return env[`DB_${key}`];
        }
        return undefined;
    };

    return {
        profile: requestedProfile || 'default',
        databaseUrl: hasProfileSettings
            ? env[profileUrlKey]
            : (useLegacySettings ? env.DATABASE_URL : undefined),
        database: readSetting('NAME'),
        schema: readSetting('SCHEMA') || 'public',
        username: readSetting('USER'),
        password: readSetting('PASSWORD'),
        host: readSetting('HOST'),
        port: readSetting('PORT') === undefined ? 5432 : Number(readSetting('PORT')),
        sslEnabled: readSetting('SSL') === 'true',
    };
}

export function shouldSyncDatabase(env = process.env) {
    return env.NODE_ENV !== 'production'
        && resolveDatabaseSettings(env).profile !== 'production';
}
