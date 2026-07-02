window.ROTACION_AWS_CONFIG = {
  enabled: true,
  region: "us-east-1",
  userPoolId: "us-east-1_XXXXXXXXX",
  userPoolClientId: "xxxxxxxxxxxxxxxxxxxxxxxxxx",
  cognitoDomain: "https://rotacion-rural-tu-nombre.auth.us-east-1.amazoncognito.com",
  apiBaseUrl: "https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com",
  redirectUri: `${window.location.origin}${window.location.pathname}`,
  logoutUri: `${window.location.origin}${window.location.pathname}`
};
