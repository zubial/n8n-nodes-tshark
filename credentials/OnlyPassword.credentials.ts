import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class OnlyPassword implements ICredentialType {
	name = 'onlyPassword';

	displayName = 'Password';

	properties: INodeProperties[] = [
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
		},
	];
}
