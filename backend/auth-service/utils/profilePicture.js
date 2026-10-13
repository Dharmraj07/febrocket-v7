const isGoogleProfilePictureUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;

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
};

const getGoogleProfilePictureUrl = (profile) => {
  const candidates = [
    ...(Array.isArray(profile?.photos)
      ? profile.photos.map((photo) => photo?.value)
      : []),
    profile?.picture,
    profile?._json?.picture,
    profile?.image?.url,
    profile?._json?.image?.url,
  ];
  const value = candidates.find(isGoogleProfilePictureUrl);
  return value ? new URL(value).toString() : null;
};

module.exports = {
  isGoogleProfilePictureUrl,
  getGoogleProfilePictureUrl,
};
