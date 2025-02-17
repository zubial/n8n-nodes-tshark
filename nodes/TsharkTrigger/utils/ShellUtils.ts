import { spawn } from 'child_process';
import { CredentialInformation } from 'n8n-workflow';

export class ShellUtils {
	async sudoCommand(
		command: string,
		workingDirectory: string,
		password: CredentialInformation | undefined,
	): Promise<string> {
		return new Promise((resolve, reject) => {
			let child = spawn('sudo', ['-S', '-k', '-p', 'pwd:', 'sh', '-c', command], {
				cwd: workingDirectory,
				detached: true,
			});
			let commandOutput: string = '';
			let commandError: string = '';

			child.stdout.on('data', (data: Buffer) => {
				commandOutput += data.toString();
			});

			child.stderr.on('data', (error: Buffer) => {
				if (error.toString() == 'pwd:') {
					child.stdin.write(password + '\n');
				} else {
					closeFunction();
					commandError = error.toString();
				}
			});

			async function closeFunction() {
				console.log('Kill process : ' + child.pid);
				if (child.pid) {
					process.kill(-child.pid, 'SIGKILL');
				} else {
					child.kill('SIGKILL');
				}
			}

			child.on('exit', (code) => {
				if (code === 0) {
					resolve(commandOutput);
				} else {
					reject(new Error(commandError));
				}
			});
		});
	}

	async command(command: string, workingDirectory: string): Promise<string> {
		return new Promise((resolve, reject) => {
			let child = spawn('sh', ['-c', command], { cwd: workingDirectory });
			let commandOutput: string = '';

			child.stdout.on('data', (data: Buffer) => {
				commandOutput += data.toString();
			});

			child.stderr.on('data', (error: Buffer) => {
				closeFunction();
				reject(new Error(error.toString()));
			});

			async function closeFunction() {
				child.kill('SIGHUP');
			}

			child.on('exit', (code) => {
				if (code === 0) {
					resolve(commandOutput);
				}
			});
		});
	}

	async resolveHomeFolder(path: string): Promise<string> {
		if (path.startsWith('~/')) {
			const command = 'echo $HOME';

			let homeFolder = await this.command(command, '/');
			homeFolder = homeFolder.replace('\n', '');

			if (!homeFolder.endsWith('/')) {
				homeFolder += '/';
			}

			return path.replace('~/', homeFolder);
		}

		if (path.startsWith('~')) {
			throw new Error('Invalid path. Replace "~" with home directory or "~/"');
		}

		return path;
	}
}
