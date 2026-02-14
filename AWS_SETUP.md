# AWS Setup

## 1) Create a Cognito User Pool

Create a user pool in AWS Cognito.

## 2) Configure App Client Auth Flow

In the Cognito app client settings, enable:

- `ALLOW_USER_PASSWORD_AUTH`

## 3) Configure SSM Parameter Store

In **AWS Systems Manager > Parameter Store**, create these parameters:

- `CLIENT_ID`: App Client ID from Cognito
- `USER_POOL_ID`: User Pool ID from Cognito
