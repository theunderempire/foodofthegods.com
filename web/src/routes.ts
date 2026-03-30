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
