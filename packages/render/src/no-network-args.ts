export const NO_NETWORK_ARGS = [
  '--proxy-server=socks5://127.0.0.1:9',
  '--proxy-bypass-list=<-loopback>',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
] as const
