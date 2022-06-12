import { route } from "@ddadaal/next-typed-api-routes-runtime";
import { asyncClientCall } from "@ddadaal/tsgrpc-utils";
import { authenticate } from "src/auth/server";
import { AppServiceClient, AppSession } from "src/generated/portal/app";
import { getJobServerClient } from "src/utils/client";

export interface GetAppSessionsSchema {
  method: "GET";

  query: {
    cluster: string;
  }

  responses: {
    200: {
      sessions: AppSession[];
    };
  }
}

const auth = authenticate(() => true);

export default /* #__PURE__*/route<GetAppSessionsSchema>("GetAppSessionsSchema", async (req, res) => {

  const info = await auth(req, res);

  if (!info) { return; }

  const client = getJobServerClient(AppServiceClient);

  const { cluster } = req.query;

  return await asyncClientCall(client, "getSessions", {
    cluster,
    userId: info.identityId,
  })
    .then(async ({ sessions }) => {
      return { 200: { sessions } };
    });
});
