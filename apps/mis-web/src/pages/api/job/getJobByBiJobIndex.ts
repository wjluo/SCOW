/**
 * Copyright (c) 2022 Peking University and Peking University Institute for Computing and Digital Economy
 * SCOW is licensed under Mulan PSL v2.
 * You can use this software according to the terms and conditions of the Mulan PSL v2.
 * You may obtain a copy of Mulan PSL v2 at:
 *          http://license.coscl.org.cn/MulanPSL2
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND,
 * EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT,
 * MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
 * See the Mulan PSL v2 for more details.
 */

import { typeboxRoute, typeboxRouteSchema } from "@ddadaal/next-typed-api-routes-runtime";
import { asyncClientCall } from "@ddadaal/tsgrpc-client";
import { Status } from "@grpc/grpc-js/build/src/constants";
import { JobServiceClient } from "@scow/protos/build/server/job";
import { Type } from "@sinclair/typebox";
import { authenticate } from "src/auth/server";
import { TenantRole } from "src/models/User";
import { JobInfo } from "src/pages/api/job/jobInfo";
import { getClient } from "src/utils/client";
import { handlegRPCError } from "src/utils/server";

export const GetJobByBiJobIndexSchema = typeboxRouteSchema({
  method: "GET",

  query: Type.Object({
    biJobIndex: Type.String(),
  }),

  responses: {
    200: Type.Object({ info: JobInfo }),
    /** 作业未找到 */
    404: Type.Null(),
  },
});

const auth = authenticate((info) => info.tenantRoles.includes(TenantRole.TENANT_ADMIN));

export default typeboxRoute(GetJobByBiJobIndexSchema,
  async (req, res) => {

    const info = await auth(req, res);
    if (!info) {
      return;
    }

    const { biJobIndex } = req.query;

    const client = getClient(JobServiceClient);

    return await asyncClientCall(client, "getJobByBiJobIndex", {
      biJobIndex,
    })
      .then(({ info }) => info ? ({ 200: { info } }) : ({ 404: null }))
      .catch(handlegRPCError({
        [Status.NOT_FOUND]: () => ({ 404: null }),
      }));
  });
