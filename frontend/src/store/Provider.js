"use client";

import { useEffect } from "react";
import { Provider } from "react-redux";
import { store } from "./store";
import { remoteLogout } from "@/features/auth/authSlice";

const AUTH_CHANNEL_NAME = "febrocket-auth-events";
const AUTH_STORAGE_EVENT_KEY = "febrocket-auth-event";

export default function StoreProvider({ children }) {
  useEffect(() => {
    const handleRemoteLogout = (event) => {
      if (event.data?.type === "logout") {
        store.dispatch(remoteLogout());
      }
    };
    const handleStorageEvent = (event) => {
      if (event.key === AUTH_STORAGE_EVENT_KEY && event.newValue) {
        store.dispatch(remoteLogout());
      }
    };

    let channel;
    if ("BroadcastChannel" in window) {
      try {
        channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
        channel.addEventListener("message", handleRemoteLogout);
      } catch (error) {
        console.warn("Could not listen for cross-tab logout events:", error);
        window.addEventListener("storage", handleStorageEvent);
      }
    } else {
      window.addEventListener("storage", handleStorageEvent);
    }

    return () => {
      channel?.removeEventListener("message", handleRemoteLogout);
      channel?.close();
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, []);

  return <Provider store={store}>{children}</Provider>;
}
