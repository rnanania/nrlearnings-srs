const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  AdminDeleteUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { createUser, findUserByEmail, confirmUserByEmail } = require("./userService");

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.region,
});

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const cognitoErrorResponse = (defaultMessage, error) => {
  const errorName = error?.name || "UnknownError";

  if (
    errorName === "NotAuthorizedException" ||
    errorName === "UsernameExistsException" ||
    errorName === "InvalidPasswordException" ||
    errorName === "CodeMismatchException" ||
    errorName === "ExpiredCodeException"
  ) {
    return jsonResponse(400, {
      message: defaultMessage,
      error: errorName,
    });
  }

  return jsonResponse(500, {
    message: defaultMessage,
    error: errorName,
  });
};

const parseBody = (event) => {
  if (!event || !event.body) {
    return {};
  }

  if (typeof event.body === "string") {
    return JSON.parse(event.body);
  }

  return event.body;
};

exports.signUp = async (event) => {
  try {
    const { email, password, fullName } = parseBody(event);

    if (!email || !password || !fullName) {
      return jsonResponse(400, {
        message: "email, password and fullName are required",
      });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return jsonResponse(409, {
        message: "User with this email already exists",
      });
    }

    const signUpInput = {
      ClientId: process.env.CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "name", Value: fullName },
      ],
    };
    const command = new SignUpCommand(signUpInput);

    const response = await cognitoClient.send(command);
    let user;
    try {
      user = await createUser({ email, fullName });
    } catch (createUserError) {
      if (!process.env.USER_POOL_ID) {
        return jsonResponse(500, {
          message: "Sign up failed",
          error: "UserCreatedInCognitoButDbWriteFailed",
        });
      }

      try {
        await cognitoClient.send(
          new AdminDeleteUserCommand({
            UserPoolId: process.env.USER_POOL_ID,
            Username: email,
          })
        );
      } catch (rollbackError) {
        return jsonResponse(500, {
          message: "Sign up failed",
          error: "DbWriteFailedAndRollbackFailed",
        });
      }

      return jsonResponse(500, {
        message: "Sign up failed",
        error: "UserRolledBackAfterDbWriteFailure",
      });
    }

    return jsonResponse(200, {
      message: "Sign up successful. Please confirm your email.",
      userConfirmed: response.UserConfirmed,
      userSub: response.UserSub,
      user,
    });
  } catch (error) {
    return cognitoErrorResponse("Sign up failed", error);
  }
};

exports.confirmEmail = async (event) => {
  try {
    const { email, confirmationCode } = parseBody(event);

    if (!email || !confirmationCode) {
      return jsonResponse(400, {
        message: "email and confirmationCode are required",
      });
    }

    const confirmInput = {
      ClientId: process.env.CLIENT_ID,
      Username: email,
      ConfirmationCode: confirmationCode,
    };
    const command = new ConfirmSignUpCommand(confirmInput);

    await cognitoClient.send(command);
    await confirmUserByEmail(email);

    return jsonResponse(200, {
      message: "Email confirmed successfully",
    });
  } catch (error) {
    return cognitoErrorResponse("Email confirmation failed", error);
  }
};

exports.signIn = async (event) => {
  try {
    const { email, password } = parseBody(event);

    if (!email || !password) {
      return jsonResponse(400, {
        message: "email and password are required",
      });
    }

    const command = new InitiateAuthCommand({
      ClientId: process.env.CLIENT_ID,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    const response = await cognitoClient.send(command);
    const authResult = response.AuthenticationResult || {};

    if (!authResult.AccessToken) {
      return jsonResponse(401, {
        message: "Invalid sign in response",
      });
    }

    return jsonResponse(200, {
      message: "Sign in successful",
      accessToken: authResult.AccessToken,
      idToken: authResult.IdToken,
      refreshToken: authResult.RefreshToken,
      expiresIn: authResult.ExpiresIn,
      tokenType: authResult.TokenType,
    });
  } catch (error) {
    return cognitoErrorResponse("Sign in failed", error);
  }
};

exports.signOut = async (event) => {
  try {
    const { accessToken } = parseBody(event);

    if (!accessToken) {
      return jsonResponse(400, {
        message: "accessToken is required",
      });
    }

    const command = new GlobalSignOutCommand({
      AccessToken: accessToken,
    });

    await cognitoClient.send(command);

    return jsonResponse(200, {
      message: "Sign out successful",
    });
  } catch (error) {
    return cognitoErrorResponse("Sign out failed", error);
  }
};
