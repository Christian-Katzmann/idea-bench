interface SecretStatus {
  configured: boolean;
  label: string;
  value?: undefined;
}

export interface ApiSettingsSummary {
  configurationHealth: {
    databaseConfigured: boolean;
    authConfigured: boolean;
    operatorConfigured: boolean;
    openrouterConfigured: boolean;
  };
  secrets: {
    database: SecretStatus;
    auth: SecretStatus;
    operator: SecretStatus;
    openrouter: SecretStatus;
  };
  notes: string[];
}

export function buildApiSettingsSummary(
  env: Record<string, string | undefined> = process.env,
): ApiSettingsSummary {
  const databaseConfigured = !!env.DATABASE_URL;
  const authConfigured = !!env.AUTH_SECRET;
  const operatorConfigured = !!env.OPERATOR_PASSWORD;
  const openrouterConfigured = !!env.OPENROUTER_API_KEY;

  return {
    configurationHealth: {
      databaseConfigured,
      authConfigured,
      operatorConfigured,
      openrouterConfigured,
    },
    secrets: {
      database: {
        configured: databaseConfigured,
        label: databaseConfigured
          ? 'Database secret present'
          : 'DATABASE_URL missing',
      },
      auth: {
        configured: authConfigured,
        label: authConfigured ? 'Auth secret present' : 'AUTH_SECRET missing',
      },
      operator: {
        configured: operatorConfigured,
        label: operatorConfigured
          ? 'Operator password present'
          : 'OPERATOR_PASSWORD missing',
      },
      openrouter: {
        configured: openrouterConfigured,
        label: openrouterConfigured
          ? 'OpenRouter API key present'
          : 'OPENROUTER_API_KEY missing',
      },
    },
    notes: [
      'Secret values are never exposed in the UI.',
      'Editing provider configuration in-browser is out of scope for this phase.',
    ],
  };
}
