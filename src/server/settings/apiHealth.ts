type SecretState = 'configured' | 'missing' | 'partial';

interface SecretStatus {
  configured: boolean;
  state: SecretState;
  label: string;
  value?: undefined;
}

export interface ApiSettingsSummary {
  configurationHealth: {
    databaseConfigured: boolean;
    authConfigured: boolean;
    operatorConfigured: boolean;
    openrouterConfigured: boolean;
    githubConfigured: boolean;
    resendConfigured: boolean;
  };
  secrets: {
    database: SecretStatus;
    auth: SecretStatus;
    operator: SecretStatus;
    openrouter: SecretStatus;
    github: SecretStatus;
    resend: SecretStatus;
  };
  notes: string[];
}

// Group-aware status: a multi-var secret is `partial` when some but not
// all vars in its group are set. The UI uses this to nudge the deployer
// toward finishing the setup rather than silently disabling the feature.
function groupStatus(present: ReadonlyArray<boolean>): SecretState {
  const setCount = present.filter(Boolean).length;
  if (setCount === 0) return 'missing';
  if (setCount === present.length) return 'configured';
  return 'partial';
}

export function buildApiSettingsSummary(
  env: Record<string, string | undefined> = process.env,
): ApiSettingsSummary {
  const databaseConfigured = !!env.DATABASE_URL;
  const authConfigured = !!env.AUTH_SECRET;
  const operatorConfigured = !!env.OPERATOR_PASSWORD;
  const openrouterConfigured = !!env.OPENROUTER_API_KEY;

  // GitHub OAuth = client id + secret + operator allowlist. Allowlist is
  // technically optional (callers can fall back to OPERATOR_EMAILS), but the
  // README presents the three vars as the canonical set, so treat any subset
  // as `partial` to keep the UI honest.
  const githubVars = [
    !!env.GITHUB_OAUTH_CLIENT_ID,
    !!env.GITHUB_OAUTH_CLIENT_SECRET,
    !!env.OPERATOR_GITHUB_LOGINS,
  ];
  const githubState = groupStatus(githubVars);
  const githubConfigured = githubState === 'configured';

  // Resend (email magic-link) = api key + operator allowlist.
  const resendVars = [!!env.RESEND_API_KEY, !!env.OPERATOR_EMAILS];
  const resendState = groupStatus(resendVars);
  const resendConfigured = resendState === 'configured';

  return {
    configurationHealth: {
      databaseConfigured,
      authConfigured,
      operatorConfigured,
      openrouterConfigured,
      githubConfigured,
      resendConfigured,
    },
    secrets: {
      database: {
        configured: databaseConfigured,
        state: databaseConfigured ? 'configured' : 'missing',
        label: databaseConfigured
          ? 'Database secret present'
          : 'DATABASE_URL missing',
      },
      auth: {
        configured: authConfigured,
        state: authConfigured ? 'configured' : 'missing',
        label: authConfigured ? 'Auth secret present' : 'AUTH_SECRET missing',
      },
      operator: {
        configured: operatorConfigured,
        state: operatorConfigured ? 'configured' : 'missing',
        label: operatorConfigured
          ? 'Operator password present'
          : 'OPERATOR_PASSWORD missing',
      },
      openrouter: {
        configured: openrouterConfigured,
        state: openrouterConfigured ? 'configured' : 'missing',
        label: openrouterConfigured
          ? 'OpenRouter API key present'
          : 'OPENROUTER_API_KEY missing',
      },
      github: {
        configured: githubConfigured,
        state: githubState,
        label: githubLabel(githubState, githubVars),
      },
      resend: {
        configured: resendConfigured,
        state: resendState,
        label: resendLabel(resendState, resendVars),
      },
    },
    notes: [
      'Secret values are never exposed in the UI.',
      'Editing provider configuration in-browser is out of scope for this phase.',
    ],
  };
}

function githubLabel(state: SecretState, vars: ReadonlyArray<boolean>): string {
  if (state === 'configured') return 'GitHub OAuth client + allowlist present';
  if (state === 'missing') return 'GitHub OAuth not configured';
  const [hasId, hasSecret, hasAllowlist] = vars;
  const missing: string[] = [];
  if (!hasId) missing.push('GITHUB_OAUTH_CLIENT_ID');
  if (!hasSecret) missing.push('GITHUB_OAUTH_CLIENT_SECRET');
  if (!hasAllowlist) missing.push('OPERATOR_GITHUB_LOGINS');
  return `Missing: ${missing.join(', ')}`;
}

function resendLabel(state: SecretState, vars: ReadonlyArray<boolean>): string {
  if (state === 'configured') return 'Resend API key + operator allowlist present';
  if (state === 'missing') return 'Email magic-link not configured';
  const [hasKey, hasAllowlist] = vars;
  const missing: string[] = [];
  if (!hasKey) missing.push('RESEND_API_KEY');
  if (!hasAllowlist) missing.push('OPERATOR_EMAILS');
  return `Missing: ${missing.join(', ')}`;
}
