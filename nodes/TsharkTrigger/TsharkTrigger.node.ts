import {
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
	NodeConnectionType,
} from 'n8n-workflow';
import { spawn } from 'child_process';
import { ShellUtils } from './utils/ShellUtils';
import { TsharkUtils } from './utils/TsharkUtils';

export class TsharkTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Tshark Trigger',
		name: 'tsharkTrigger',
		icon: 'file:TsharkTriggerLogo.svg',
		group: ['trigger'],
		version: 1,
		triggerPanel: true,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Starts the workflow with Tshark',
		defaults: {
			name: 'Tshark Trigger',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				displayName: 'Local Sudo Password',
				name: 'onlyPassword',
				required: true,
				//testedBy: 'localConnectionTest',
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Sniff Beacon',
						value: 'beacon',
						description: 'Trigger when a beacon frames is detected',
						action: 'Sniff beacon frames',
					},
					{
						name: 'Sniff Probe Response',
						value: 'probe_response',
						description: 'Trigger when a probe responses is detected',
						action: 'Sniff probe responses',
					},
					{
						name: 'Sniff Probe Request',
						value: 'probe_request',
						description: 'Trigger when a probe requests is detected',
						action: 'Sniff probe requests',
					},
				],
				default: 'beacon',
			},
			{
				displayName: 'Interface',
				name: 'network_interface',
				type: 'string',
				default: 'wlan1',
				description: 'Use this network monitoring interface',
				required: true,
			},
			{
				displayName: 'Channel Hopping List',
				name: 'channels',
				type: 'string',
				default: '1,2,3,4,5,6,7,8,9,10,11,12,13,36,40,44,48',
				description: 'List of channels to hop through (check supported channels with "iw list")',
				required: true,
			},
			{
				displayName: 'Channel Hopping Interval',
				name: 'hopping_interval',
				type: 'number',
				default: 30,
				description: 'Interval between channel hops (in seconds)',
				required: true,
			},
			{
				displayName: 'Emission Interval',
				name: 'limit_interval',
				type: 'number',
				default: 60,
				description: 'Interval between trigger emissions (in seconds)',
				required: true,
			},
			{
				displayName: 'Maximum Emissions',
				name: 'limit_emits',
				type: 'number',
				default: 10,
				description: 'Maximum number of trigger emissions per interval',
				required: true,
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const operation = this.getNodeParameter('operation', 0) as string;
		const network_interface = this.getNodeParameter('network_interface', 0) as string;
		const limit_emits = this.getNodeParameter('limit_emits', 0) as number;
		const limit_interval = this.getNodeParameter('limit_interval', 0) as number;

		// Credentials
		const credentials = await this.getCredentials('onlyPassword');

		let command: string = `tshark -help`;

		if (operation === 'beacon') {
			command = `tshark -i ${network_interface} -Y "wlan.fc.type_subtype == 8 && wlan.ssid != \\"\\"" -T fields -e wlan.fc.type_subtype -e wlan.sa -e wlan.sa_resolved -e wlan.ssid -e radiotap.channel.freq -e radiotap.dbm_antsignal -N m -l`;
		} else if (operation === 'probe_response') {
			command = `tshark -i ${network_interface} -Y "wlan.fc.type_subtype == 5 && wlan.ssid != \\"\\"" -T fields -e wlan.fc.type_subtype -e wlan.sa -e wlan.sa_resolved -e wlan.ssid -e radiotap.channel.freq -e radiotap.dbm_antsignal -N m -l`;
		} else if (operation === 'probe_request') {
			command = `tshark -i ${network_interface} -Y "wlan.fc.type_subtype == 4 && wlan.ssid != \\"\\"" -T fields -e wlan.fc.type_subtype -e wlan.sa -e wlan.sa_resolved -e wlan.ssid -e radiotap.channel.freq -e radiotap.dbm_antsignal -N m -l`;
		}

		const shellUtils = new ShellUtils();
		const workingDirectory = await shellUtils.resolveHomeFolder('~/');

		console.log(`Tshark process starting ${command}`);
		let child = spawn('sudo', ['-S', '-k', '-p', 'pwd:', 'sh', '-c', command], {
			cwd: workingDirectory,
			detached: true,
		});
		child.stderr.pipe(process.stderr);

		child.stderr.on('data', (error: Buffer) => {
			if (error.toString() == 'pwd:') {
				child.stdin.write(credentials.password + '\n');
			}
		});

		let limit_count = 0;
		let previous = '';
		let results: {
			frameType: string;
			macAddress: string;
			macResolved: string;
			ssid: string;
			frequencyMHz: string;
			signalDbm: string;
		}[] = [];
		child.stdout.on('data', (data: Buffer) => {
			const lines: string[] = data
				.toString()
				.split('\n')
				.filter((line) => line.trim() !== ''); // Split lines and filter out empty lines

			for (const line of lines) {
				// Reject Duplicate Lines
				if (line !== previous) {
					const fields = line.split(/\s+/); // Split line
					if (fields.length == 6) {
						const frameType: string = fields[0];
						const macAddress: string = fields[1];
						const macResolved: string = fields[2];
						const ssid: string = TsharkUtils.decodeSSID(fields[3]);
						const frequencyMHz: string = fields[4];
						const signalDbm: string = fields[5];

						limit_count++;
						if (ssid.length > 0 && results.length < limit_emits) {
							results.push({ frameType, macAddress, macResolved, ssid, frequencyMHz, signalDbm });
						} else {
							const r = Math.floor(Math.random() * limit_count);
							if (r < limit_emits) {
								results[r] = { frameType, macAddress, macResolved, ssid, frequencyMHz, signalDbm };
							}
						}
					}
					previous = line;
				}
			}
		});

		const resetLimit = () => {
			if (results.length > 0) {
				this.emit([this.helpers.returnJsonArray(results)]);
			}
			results = [];
			limit_count = 0;
		};
		const limit = setInterval(resetLimit, limit_interval * 1000);

		child.on('close', (code, signal) => {
			console.log(`Tshark process terminated`);
		});

		// Channel hopping
		const channelsParam = this.getNodeParameter('channels', 0) as string;
		const hopping_interval = this.getNodeParameter('hopping_interval', 0) as number;

		const channels = channelsParam.split(',').map((c) => c.trim());
		let currentChannelIndex = 0;

		async function channelHop() {
			const channel = channels[currentChannelIndex];
			const cmdHopping = `iw dev ${network_interface} set channel ${channel}`;

			await shellUtils
				.sudoCommand(cmdHopping, workingDirectory, credentials.password)
				.then((output) => {
					console.log(`Channel hopping done ${cmdHopping}`);
				});

			currentChannelIndex = (currentChannelIndex + 1) % channels.length;
		}

		// Start channel hopping
		const timer = setInterval(channelHop, hopping_interval * 1000);

		async function closeFunction() {
			// Close limit emits
			clearInterval(limit);

			// Close channel hopping
			clearInterval(timer);

			// Kill tshark
			console.log(`Child process : ${child.pid}`);

			if (child.pid) {
				process.kill(-child.pid, 'SIGKILL');
			} else {
				child.kill('SIGKILL');
			}
		}

		return {
			closeFunction,
		};
	}
}
