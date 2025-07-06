import { DurableObject } from "cloudflare:workers";

type RawUserMessage = {
	text: string;
	name: string;
	connection_established?: boolean;
}


type FormattedUserMessage = {
	text: string;
	type: string;
	name?: string
}



export class Chat extends DurableObject {
	constructor(ctx: DurableObjectState, env: any) {
		super(ctx, env);
	}

	async webSocketMessage(ws: WebSocket, message: string) {
		const user_message = this.formatUserMessage(message);
		this.persistHistory(user_message);
		this.broadcastMessage(user_message);
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {

		ws.close(code, "Durable Object is closing WebSocket");
	}

	broadcastMessage(user_message: FormattedUserMessage) {

		const websockets = this.ctx.getWebSockets();
		for (const ws of websockets) {
			ws.send(JSON.stringify(user_message));
		}

	}

	formatUserMessage(websocket_message: string): FormattedUserMessage {
		const data = JSON.parse(websocket_message) as RawUserMessage;

		let user_message;

		if (data.connection_established) {
			user_message = {
				text: `${data.name} has joined the chat!`,
				type: "metadata",
			}
		} else {
			user_message = {
				text: data.text,
				type: "user_message",
				name: data.name,
			}
		}

		return user_message;
	}



	async fetch(request: Request) {
		let [client, server] = Object.values(new WebSocketPair())

		this.ctx.acceptWebSocket(server);

		await this.ctx.storage.get<FormattedUserMessage[]>("message-history").then(messages => {
			if (messages) {
				for (const message of messages) {
					server.send(JSON.stringify(message));
				}
			}
		})

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async persistHistory(user_message: FormattedUserMessage) {
		const history = await this.ctx.storage.get("message-history");
		if (!history) {
			if (!Array.isArray(history)) {
				await this.ctx.storage.put("message-history", [user_message]);
			} else {
				history.push(user_message);
				await this.ctx.storage.put("message-history", history);
			}
		}
	}
}
