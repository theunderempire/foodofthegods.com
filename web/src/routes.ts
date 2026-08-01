export const ROUTES = {
  recipes: {
    list: "/recipes",
    view: (id: string) => `/recipes/${id}`,
    new: "/recipes/new",
    edit: (id: string) => `/recipes/${id}/edit`,
    share: (shareId: string) => `/recipes/${shareId}/share`,
    VIEW_PATTERN: "/recipes/:id",
    EDIT_PATTERN: "/recipes/:id/edit",
    SHARE_PATTERN: "/recipes/:shareId/share",
  },
};

// In production the app is served from a sub-path (vite `base`, mirrored into the
// router's basename). window.location.origin does not include that prefix, so an
// absolute link built from origin alone lands outside the app and 404s.
export function absoluteUrl(routePath: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${window.location.origin}${base}${routePath}`;
}

export function shareUrl(shareId: string): string {
  return absoluteUrl(ROUTES.recipes.share(shareId));
}
