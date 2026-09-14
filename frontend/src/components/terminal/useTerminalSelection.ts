import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../../api";
import type { Server } from "../../types";
import {
  TERMINAL_STORAGE_KEYS,
  filterServers,
  readStored,
  writeStored
} from "./helpers";

export function useTerminalSelection(servers: Server[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryServerId = searchParams.get("server") ?? "";

  const [selectedServerId, setSelectedServerIdState] = useState(() => {
    return queryServerId || readStored(TERMINAL_STORAGE_KEYS.serverId);
  });
  const [selectedLogin, setSelectedLoginState] = useState("");
  const [availableLogins, setAvailableLogins] = useState<string[]>([]);
  const [loadingLogins, setLoadingLogins] = useState(false);
  const [serverQuery, setServerQuery] = useState("");

  const selectedServer = useMemo(
    () => servers.find((server) => String(server.id) === selectedServerId) ?? null,
    [servers, selectedServerId]
  );

  const filteredServers = useMemo(() => filterServers(servers, serverQuery), [servers, serverQuery]);

  const setSelectedLogin = useCallback((login: string) => {
    setSelectedLoginState(login);
    if (login) {
      writeStored(TERMINAL_STORAGE_KEYS.login, login);
    }
  }, []);

  const setSelectedServerId = useCallback(
    (serverId: string) => {
      setSelectedServerIdState(serverId);
      writeStored(TERMINAL_STORAGE_KEYS.serverId, serverId);
      const next = new URLSearchParams(searchParams);
      if (serverId) {
        next.set("server", serverId);
      } else {
        next.delete("server");
      }
      setSearchParams(next, { replace: true });

      const server = servers.find((item) => String(item.id) === serverId);
      const baseLogin = server?.login ?? "";
      setSelectedLoginState(baseLogin);
      setAvailableLogins(baseLogin ? [baseLogin] : []);
      if (baseLogin) {
        writeStored(TERMINAL_STORAGE_KEYS.login, baseLogin);
      }
    },
    [searchParams, setSearchParams, servers]
  );

  useEffect(() => {
    if (queryServerId && queryServerId !== selectedServerId) {
      setSelectedServerId(queryServerId);
    }
  }, [queryServerId, selectedServerId, setSelectedServerId]);

  useEffect(() => {
    if (!selectedServerId) {
      setSelectedLoginState("");
      setAvailableLogins([]);
      setLoadingLogins(false);
      return;
    }

    const baseLogin = selectedServer?.login ?? "";
    if (!baseLogin) {
      return;
    }

    setSelectedLoginState((current) => current || baseLogin);
    setAvailableLogins((current) => (current.length > 0 ? current : [baseLogin]));

    let cancelled = false;
    setLoadingLogins(true);
    void api
      .listLinuxUsers(Number(selectedServerId))
      .then((users) => {
        if (cancelled) {
          return;
        }
        const logins = Array.from(new Set([baseLogin, ...users.map((user) => user.username)].filter(Boolean)));
        setAvailableLogins(logins);
        setSelectedLoginState((current) => (current && logins.includes(current) ? current : baseLogin));
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableLogins([baseLogin]);
          setSelectedLoginState((current) => current || baseLogin);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingLogins(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedServerId, selectedServer?.login]);

  return {
    selectedServerId,
    setSelectedServerId,
    selectedServer,
    selectedLogin,
    setSelectedLogin,
    availableLogins,
    loadingLogins,
    serverQuery,
    setServerQuery,
    filteredServers
  };
}
