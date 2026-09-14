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
  const [selectedLogin, setSelectedLoginState] = useState(() => readStored(TERMINAL_STORAGE_KEYS.login));
  const [availableLogins, setAvailableLogins] = useState<string[]>([]);
  const [loadingLogins, setLoadingLogins] = useState(false);
  const [serverQuery, setServerQuery] = useState("");

  const selectedServer = useMemo(
    () => servers.find((server) => String(server.id) === selectedServerId) ?? null,
    [servers, selectedServerId]
  );

  const filteredServers = useMemo(() => filterServers(servers, serverQuery), [servers, serverQuery]);

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
    },
    [searchParams, setSearchParams]
  );

  const setSelectedLogin = useCallback((login: string) => {
    setSelectedLoginState(login);
    writeStored(TERMINAL_STORAGE_KEYS.login, login);
  }, []);

  useEffect(() => {
    if (queryServerId && queryServerId !== selectedServerId) {
      setSelectedServerIdState(queryServerId);
      writeStored(TERMINAL_STORAGE_KEYS.serverId, queryServerId);
    }
  }, [queryServerId, selectedServerId]);

  useEffect(() => {
    if (!selectedServerId) {
      setSelectedLoginState("");
      setAvailableLogins([]);
      return;
    }

    const server = servers.find((item) => String(item.id) === selectedServerId);
    const baseLogin = server?.login ?? "";
    setSelectedLoginState((current) => {
      if (current && current === baseLogin) {
        return current;
      }
      const storedLogin = readStored(TERMINAL_STORAGE_KEYS.login);
      if (storedLogin === baseLogin) {
        return storedLogin;
      }
      return baseLogin;
    });
    setAvailableLogins(baseLogin ? [baseLogin] : []);

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
        setSelectedLoginState((current) => {
          if (current && logins.includes(current)) {
            return current;
          }
          return logins[0] ?? baseLogin;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableLogins(baseLogin ? [baseLogin] : []);
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
  }, [selectedServerId, servers]);

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
