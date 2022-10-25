import { plugin } from "@ddadaal/tsgrpc-server";
import { ServiceError } from "@grpc/grpc-js";
import { Status } from "@grpc/grpc-js/build/src/constants";
import { displayIdToPort } from "src/clusterops/slurm/bl/port";
import { portalConfig } from "src/config/portal";
import { DesktopServiceServer, DesktopServiceService } from "src/generated/portal/desktop";
import { clusterNotFound } from "src/utils/errors";
import { getClusterLoginNode, loggedExec, sshConnect } from "src/utils/ssh";
import { parseDisplayId, parseListOutput, parseOtp, refreshPassword, VNCSERVER_BIN_PATH } from "src/utils/turbovnc";

function ensureEnabled() {
  if (!portalConfig.loginDesktop.enabled) {
    throw <ServiceError>{ code: Status.UNAVAILABLE, message: "Login deskto is not enabled" };
  }
}

export const desktopServiceServer = plugin((server) => {

  server.addService<DesktopServiceServer>(DesktopServiceService, {
    createDesktop: async ({ request, logger }) => {
      const { cluster, wm, userId } = request;

      ensureEnabled();

      if (portalConfig.loginDesktop.wms.find((x) => x.wm === wm) === undefined) {
        throw <ServiceError>{ code: Status.INVALID_ARGUMENT, message: `${wm} is not a acceptable wm.` };
      }

      const host = getClusterLoginNode(cluster);

      if (!host) { throw clusterNotFound(cluster); }

      return await sshConnect(host, userId, logger, async (ssh) => {
        // find if the user has running session
        let resp = await loggedExec(ssh, logger, true,
          VNCSERVER_BIN_PATH, ["-list"],
        );

        const ids = parseListOutput(resp.stdout);

        if (ids.length >= portalConfig.loginDesktop.maxDesktops) {
          throw <ServiceError> { code: Status.RESOURCE_EXHAUSTED, message: "Too many desktops" };
        }

        // start a session

        // explicitly set securitytypes to avoid requiring setting vnc passwd
        const params = ["-securitytypes", "OTP", "-otp"];

        if (wm) {
          params.push("-wm");
          params.push(wm);
        }

        resp = await loggedExec(ssh, logger, true, VNCSERVER_BIN_PATH, params);

        // parse the OTP from output. the output was in stderr
        const password = parseOtp(resp.stderr);
        // parse display id from output
        const displayId = parseDisplayId(resp.stderr);

        const port = displayIdToPort(displayId);

        return [{ node: host, password, port }];

      });
    },

    killDesktop: async ({ request, logger }) => {
      ensureEnabled();

      const { cluster, displayId, userId } = request;

      const host = getClusterLoginNode(cluster);

      if (!host) { throw clusterNotFound(cluster); }

      return await sshConnect(host, userId, logger, async (ssh) => {

        // kill specific desktop
        await loggedExec(ssh, logger, true, VNCSERVER_BIN_PATH, ["-kill", ":" + displayId]);

        return [{}];
      });

    },

    connectToDesktop: async ({ request, logger }) => {

      ensureEnabled();

      const { cluster, displayId, userId } = request;


      const host = getClusterLoginNode(cluster);

      if (!host) { throw clusterNotFound(cluster); }

      return await sshConnect(host, userId, logger, async (ssh) => {

        const password = await refreshPassword(ssh, logger, displayId);

        return [{ node: host, port: displayIdToPort(displayId), password }];
      });

    },

    listDesktops: async ({ request, logger }) => {

      ensureEnabled();

      const { cluster, userId } = request;

      const host = getClusterLoginNode(cluster);

      if (!host) { throw clusterNotFound(cluster); }

      return await sshConnect(host, userId, logger, async (ssh) => {

        // list all running session
        const resp = await loggedExec(ssh, logger, true,
          VNCSERVER_BIN_PATH, ["-list"],
        );

        const ids = parseListOutput(resp.stdout);

        return [{
          node: host,
          displayIds: ids,
        }];
      });

    },

  });

});