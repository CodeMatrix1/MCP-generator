export async function onboardMemberWorkflow(ctx: any, input: {
  username: string;
  channel_name: string;
  welcome_message: string;
}) {
  const { username, channel_name, welcome_message } = input;

  // Step 1: Lookup user
  const userResult = await get_api_v1_users_list({
    username,
  });

  if (!userResult || !userResult.users || userResult.users.length === 0) {
    throw new Error(`User '${username}' not found`);
  }

  const user = userResult.users[0];

  // Step 2: Ensure channel exists (create if not)
  let channel;
  try {
    const channelResult = await ctx.runTool("get-api-v1-channels.info", {
      roomName: channel_name,
    });
    channel = channelResult.channel;
  } catch (err) {
    // If not found, create channel
    const createResult = await ctx.runTool("post-api-v1-channels.create", {
      name: channel_name,
    });
    channel = createResult.channel;
  }

  if (!channel) {
    throw new Error(`Failed to ensure channel '${channel_name}'`);
  }

  // Step 3: Invite member to channel
  await ctx.runTool("post-api-v1-channels.invite", {
    roomId: channel._id,
    userId: user._id,
  });

  // Step 4: Send welcome message
  await ctx.runTool("post-api-v1-chat.postMessage", {
    roomId: channel._id,
    text: welcome_message,
  });

  return {
    success: true,
    message: `User '${username}' onboarded to '${channel_name}' successfully.`,
  };
}