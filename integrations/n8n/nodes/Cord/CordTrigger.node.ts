import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { EVENT_OPTIONS } from './events';

const API = 'https://cordhq.app/api/v1';

function safeEqual(a: string, b: string): boolean {
	const x = Buffer.from(a, 'utf8');
	const y = Buffer.from(b, 'utf8');
	return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Cord signs `<timestamp>.<raw body>` with HMAC-SHA256. During a secret rotation the
 * header carries two `v1=` values and either one may match; old deliveries are rejected.
 */
export function signatureMatches(
	rawBody: string,
	header: string | undefined,
	secret: string | undefined,
	toleranceSeconds = 300,
): boolean {
	if (!header || !secret) return false;
	let timestamp: string | null = null;
	const signatures: string[] = [];
	for (const pair of String(header).split(',')) {
		const eq = pair.indexOf('=');
		if (eq === -1) continue;
		const key = pair.slice(0, eq).trim();
		const value = pair.slice(eq + 1).trim();
		if (key === 't') timestamp = value;
		else if (key === 'v1') signatures.push(value);
	}
	if (!timestamp || signatures.length === 0) return false;
	const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10));
	if (!Number.isFinite(age) || age > toleranceSeconds) return false;
	const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
	return signatures.some((signature) => safeEqual(expected, signature));
}

export class CordTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Cord Trigger',
		name: 'cordTrigger',
		icon: { light: 'file:cord.svg', dark: 'file:cord.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["eventos"].join(", ")}}',
		description: 'Starts the workflow when something happens in Cord',
		defaults: { name: 'Cord Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'cordApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'eventos',
				type: 'multiOptions',
				required: true,
				default: [],
				description: 'Cord sends only the events you choose',
				options: EVENT_OPTIONS,
			},
			{
				displayName: 'Verify Signature',
				name: 'verificar',
				type: 'boolean',
				default: true,
				description:
					'Whether to reject deliveries whose X-Cord-Signature-V1 does not match the webhook secret',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				return Boolean(data.webhookId);
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const url = this.getNodeWebhookUrl('default');
				const eventos = this.getNodeParameter('eventos') as string[];
				const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'cordApi', {
					method: 'POST',
					url: `${API}/webhooks`,
					body: { url, eventos },
					json: true,
				})) as IDataObject;
				const created = (response?.data ?? response) as IDataObject | undefined;
				if (!created?.id) return false;
				data.webhookId = created.id;
				// Cord only returns the signing secret on creation.
				data.secret = (created.secret as string | undefined) ?? null;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (!data.webhookId) return true;
				try {
					await this.helpers.httpRequestWithAuthentication.call(this, 'cordApi', {
						method: 'DELETE',
						url: `${API}/webhooks/${data.webhookId as string}`,
						json: true,
					});
				} catch (error) {
					// A webhook already removed in Cord must not block removing the node.
					this.logger.warn('Cord webhook could not be deleted', { webhookId: data.webhookId, error: (error as Error).message });
				}
				delete data.webhookId;
				delete data.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject() as ReturnType<IWebhookFunctions['getRequestObject']> & {
			rawBody?: Buffer;
		};
		const data = this.getWorkflowStaticData('node');
		const verify = this.getNodeParameter('verificar', true) as boolean;
		const eventos = this.getNodeParameter('eventos', []) as string[];

		if (verify && data.secret) {
			const header = req.headers['x-cord-signature-v1'];
			const valid =
				!!req.rawBody &&
				signatureMatches(
					req.rawBody.toString('utf8'),
					Array.isArray(header) ? header[0] : header,
					data.secret as string,
				);
			if (!valid) {
				this.getResponseObject().status(401).end();
				return { noWebhookResponse: true };
			}
		}

		const body = (req.body ?? {}) as IDataObject;
		// Cord already filters by subscription; this also covers events removed from the node without recreating the webhook.
		if (eventos.length && typeof body.event === 'string' && !eventos.includes(body.event)) {
			return { workflowData: [] };
		}

		return { workflowData: [this.helpers.returnJsonArray([body])] };
	}
}
