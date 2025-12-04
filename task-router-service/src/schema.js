export const typeDefs = `#graphql
  type Query {
    health: String!
  }

  type Mutation {
    sendMessage(input: MessageInput!): MessageResponse!
  }

  input MessageInput {
    channel: Channel!
    recipient: String!
    subject: String
    body: String!
    metadata: JSON
  }

  enum Channel {
    email
    sms
    whatsapp
  }

  type MessageResponse {
    success: Boolean!
    messageId: String
    traceId: String!
    message: String!
  }

  scalar JSON
`;
