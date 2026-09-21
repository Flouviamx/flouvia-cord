import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CordApi implements ICredentialType {
	name = 'cordApi';

	displayName = 'Cord API';

	icon: Icon = { light: 'file:../nodes/Cord/cord.svg', dark: 'file:../nodes/Cord/cord.dark.svg' };

	documentationUrl = 'https://cordhq.app/en/support/conectar-n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Secret key from Cord (sk_live_ or sk_test_). Create it in Settings, Developer mode, API tab. Publishable keys (pk_) do not work here.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
				Accept: 'application/json',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://cordhq.app/api/v1',
			url: '/me',
			method: 'GET',
		},
	};
}
