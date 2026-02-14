const crypto = require("crypto");
const {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");

const dynamoClient = new DynamoDBClient({
  region: process.env.region,
});

const USERS_TABLE = process.env.USERS_TABLE;
const USERS_EMAIL_INDEX = process.env.USERS_EMAIL_INDEX || "EmailIndex";

const findUserByEmail = async (email) => {
  if (!email) {
    throw new Error("email is required");
  }

  const findCommand = new QueryCommand({
    TableName: USERS_TABLE,
    IndexName: USERS_EMAIL_INDEX,
    KeyConditionExpression: "#email = :email",
    ExpressionAttributeValues: {
      ":email": { S: email },
    },
    ProjectionExpression: "userId, #status",
    ExpressionAttributeNames: {
      "#email": "email",
      "#status": "status",
    },
    Limit: 1,
  });

  const findResponse = await dynamoClient.send(findCommand);
  const item = findResponse.Items?.[0];

  if (!item) {
    return null;
  }

  return {
    userId: item.userId?.S,
    status: item.status?.S,
  };
};

const createUser = async ({ email, fullName }) => {
  if (!email || !fullName) {
    throw new Error("email and fullName are required");
  }

  const userId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const command = new PutItemCommand({
    TableName: USERS_TABLE,
    Item: {
      userId: { S: userId },
      email: { S: email },
      fullName: { S: fullName },
      status: { S: "PENDING" },
      createdAt: { S: createdAt },
    },
    ConditionExpression: "attribute_not_exists(userId)",
  });

  await dynamoClient.send(command);

  return {
    userId,
    email,
    fullName,
    createdAt,
  };
};

const confirmUserByEmail = async (email) => {
  if (!email) {
    throw new Error("email is required");
  }

  const user = await findUserByEmail(email);
  const userId = user?.userId;

  if (!userId) {
    return null;
  }

  const updateCommand = new UpdateItemCommand({
    TableName: USERS_TABLE,
    Key: {
      userId: { S: userId },
    },
    UpdateExpression: "SET #status = :confirmed",
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":confirmed": { S: "CONFIRMED" },
    },
    ConditionExpression: "attribute_exists(userId)",
  });

  await dynamoClient.send(updateCommand);

  return { userId, status: "CONFIRMED" };
};

module.exports = {
  createUser,
  findUserByEmail,
  confirmUserByEmail,
};

