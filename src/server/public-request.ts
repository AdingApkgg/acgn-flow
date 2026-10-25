/** 公网 TLS 在隧道终止时，按已配置的确切主机恢复协议，统一同源和回调判断。 */
export function publicRequest(request: Request, configuredUrl: string | undefined): Request {
  if (!configuredUrl) return request;
  const configured = new URL(configuredUrl);
  const incoming = new URL(request.url);
  if (incoming.host !== configured.host || incoming.protocol === configured.protocol)
    return request;
  incoming.protocol = configured.protocol;
  return new Request(incoming, request);
}
