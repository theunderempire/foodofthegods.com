import axios from "axios";
import Cookies from "js-cookie";

const COOKIE_NAME = "FOTG_AUTH_TOKEN";
const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://theunderempire.com/foodofthegods-api";

export const client = axios.create({ baseURL: BASE_URL });

client.interceptors.request.use((config) => {
  const token = Cookies.get(COOKIE_NAME);
  if (token) {
    config.headers["X-Access-Token"] = token;
  }
  return config;
});

function dispatchError(message: string) {
  console.error("[api]", message);
  window.dispatchEvent(new CustomEvent("api-error", { detail: message }));
}

client.interceptors.response.use(
  (response) => {
    if (response.data?.success === false) {
      const message = response.data?.data?.message ?? "Request failed";
      dispatchError(message);
      return Promise.reject(new Error(message));
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 403) {
      Cookies.remove(COOKIE_NAME);
      localStorage.removeItem("username");
      window.location.href = import.meta.env.BASE_URL + "login";
      return Promise.reject(error);
    }
    const message = error.response?.data?.data?.message ?? error.message ?? "Network error";
    dispatchError(message);
    return Promise.reject(error);
  },
);

export { COOKIE_NAME, BASE_URL };
