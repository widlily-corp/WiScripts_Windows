export type SocketProtocol = 'TCP' | 'UDP';

export type TcpConnectionState =
  | 'CLOSED'
  | 'LISTEN'
  | 'SYN_SENT'
  | 'SYN_RCVD'
  | 'ESTABLISHED'
  | 'FIN_WAIT1'
  | 'FIN_WAIT2'
  | 'CLOSE_WAIT'
  | 'CLOSING'
  | 'LAST_ACK'
  | 'TIME_WAIT'
  | 'DELETE_TCB'
  | 'UNKNOWN'
  | string;

export interface NetworkConnection {
  protocol: string;
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  state: string;
  pid: number;
  processName: string;
  processPath: string | null;
}

export interface FirewallRuleInfo {
  name: string;
  direction: string;
  action: string;
  program: string;
  enabled: boolean;
  profile: string;
}

export interface FirewallActionResult {
  success: boolean;
  ruleName: string;
  message: string;
}
