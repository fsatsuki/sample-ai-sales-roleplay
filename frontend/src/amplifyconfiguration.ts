export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId:
        import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId:
        import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID,
      region: import.meta.env.VITE_AWS_REGION,
      identityPoolId:
        import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID,
      signUpVerificationMethod: "code" as const,
    },
  },
  API: {
    REST: {
      AISalesRoleplayAPI: {
        endpoint: (
          import.meta.env.VITE_API_GATEWAY_ENDPOINT
        ).replace(/\/$/, ""),
        region: import.meta.env.VITE_AWS_REGION,
      },
    },
  },
  // Nova 2 Sonic AgentCore Runtime設定
  NOVA_SONIC: {
    agentEndpoint: import.meta.env.VITE_NOVA_SONIC_AGENT_ENDPOINT || "",
    region: import.meta.env.VITE_NOVA_SONIC_AGENT_REGION || import.meta.env.VITE_AWS_REGION,
  },
};
