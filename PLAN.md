# Implementation plan

1. Verify Claude remote-connector authentication and Vercel account/domain access.
2. Use Streamable HTTP with the official MCP SDK and fixed Authorization bearer header authentication. Claude's current connector UI supports fixed request headers, avoiding an unnecessary OAuth service for this single-owner project.
3. Expose exactly one tool, `notify_agent_done`, with an LLM-written `message` argument, a 120-character single-septet GSM-7 budget, and recipient/sender configured only in environment variables.
4. Test the supplied Twilio request, then verify authentication rejection, real MCP client initialization/discovery/call, fixed SMS payload, and sanitized upstream failures.
5. Keep secrets in ignored local configuration and Vercel sensitive Production variables. Create a private GitHub repository, push the reviewed source, and connect Vercel.
6. Deploy, attach `lemme-know.devreddy7.in`, verify HTTPS and authenticated/unauthenticated behavior, and run one deployed notification test.
7. Document Claude setup and the need for an explicit completion instruction; this tool cannot autonomously detect agent termination.
