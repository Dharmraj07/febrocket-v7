"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import Image from "next/image";

function isTrustedProfilePicture(value) {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname === "googleusercontent.com" ||
        url.hostname.endsWith(".googleusercontent.com"))
    );
  } catch {
    return false;
  }
}

export default function ProfileAvatar({ profilePicture, className = "" }) {
  const [failedPicture, setFailedPicture] = useState(null);
  const showPicture =
    isTrustedProfilePicture(profilePicture) && failedPicture !== profilePicture;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-700 ${className}`}
      aria-hidden="true"
    >
      {showPicture ? (
        <Image
          src={profilePicture}
          alt=""
          fill
          sizes="56px"
          unoptimized
          className="h-full w-full object-cover"
          onError={() => setFailedPicture(profilePicture)}
        />
      ) : (
        <UserRound className="h-1/2 w-1/2" strokeWidth={1.8} />
      )}
    </span>
  );
}
