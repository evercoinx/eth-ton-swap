import { Inject, Injectable } from "@nestjs/common"
import tonweb from "tonweb"
import { Cell } from "tonweb/dist/types/boc/cell"
import { JettonMinter } from "tonweb/dist/types/contract/token/ft/jetton-minter"
import { WalletContract } from "tonweb/dist/types/contract/wallet/wallet-contract"
import { HttpProvider } from "tonweb/dist/types/providers/http-provider"
import { Address, AddressType } from "tonweb/dist/types/utils/address"
import { Error, Send } from "ton-node"
import nacl from "tweetnacl"
import { JETTON_CONTENT_URI, TON_CONNECTION } from "./constants"
import { MinterInfo } from "./interfaces/minter-info.interface"
import { TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { WalletSigner } from "./interfaces/wallet-signer.interface"

enum SendMode {
	NoAction = 0,
	SenderPaysForwardFees = 1,
	IgnoreErrors = 2,
	FreezeAccount = 32,
	ReturnInboundMessageValue = 64,
	ReturnAccountRemainingBalance = 128,
}

@Injectable()
export class TonContractProvider {
	private readonly httpProvider: HttpProvider
	private readonly walletClass: typeof WalletContract
	private readonly workchain: number

	constructor(@Inject(TON_CONNECTION) options: TonModuleOptions) {
		const host = `https://${
			options.blockchainId === "testnet" ? "testnet." : ""
		}toncenter.com/api/v2/jsonRPC`
		this.httpProvider = new tonweb.HttpProvider(host, { apiKey: options.apiKey })

		const wallets = new tonweb.Wallets(this.httpProvider)
		this.walletClass = wallets.all[options.walletVersion]
	}

	createWallet(secretKey: string): WalletSigner {
		const keyPair = nacl.sign.keyPair.fromSecretKey(this.hexToBytes(secretKey))
		const wallet = new this.walletClass(this.httpProvider, {
			publicKey: keyPair.publicKey,
			wc: this.workchain,
		})
		return {
			wallet,
			secretKey,
		}
	}

	createRandomWallet(): WalletSigner {
		const keyPair = nacl.sign.keyPair()
		const wallet = new this.walletClass(this.httpProvider, {
			publicKey: keyPair.publicKey,
			wc: this.workchain,
		})
		return {
			wallet,
			secretKey: this.bytesToHex(keyPair.secretKey),
		}
	}

	async deployMinterContract(
		adminWalletSigner: WalletSigner,
		amount: string,
	): Promise<MinterInfo> {
		const adminAddress = await adminWalletSigner.wallet.getAddress()
		const minter = this.createMinterContract(adminAddress)
		const minterAddress = await minter.getAddress()

		const { stateInit } = await minter.createStateInit()
		await this.transfer(adminWalletSigner, minterAddress, amount, undefined, stateInit)

		const data = await minter.getJettonData()
		return {
			totalSupply: data.totalSupply.toString(),
			minterAddress,
			adminAddress,
			jettonContentUri: data.jettonContentUri,
			isMutable: data.isMutable,
		}
	}

	async getMinterContractData(adminWalletSigner: WalletSigner): Promise<MinterInfo> {
		const adminAddress = await adminWalletSigner.wallet.getAddress()
		const minter = this.createMinterContract(adminAddress)
		const minterAddress = await minter.getAddress()

		const data = await minter.getJettonData()
		return {
			totalSupply: data.totalSupply.toString(),
			minterAddress,
			adminAddress,
			jettonContentUri: data.jettonContentUri,
			isMutable: data.isMutable,
		}
	}

	private createMinterContract(adminAddress: Address): JettonMinter {
		const { JettonMinter, JettonWallet } = tonweb.token.jetton
		return new JettonMinter(this.httpProvider, {
			adminAddress,
			jettonContentUri: JETTON_CONTENT_URI,
			jettonWalletCodeHex: JettonWallet.codeHex,
			wc: this.workchain as 0,
		})
	}

	async transfer(
		walletSinger: WalletSigner,
		recipientAddress: AddressType,
		amount: string | number,
		payload?: string,
		stateInit?: Cell,
	): Promise<void> {
		const seqno = await walletSinger.wallet.methods.seqno().call()
		if (seqno == null) {
			throw new Error(`Seqno not defined`)
		}

		const amountNano = tonweb.utils.toNano(amount)
		const request = walletSinger.wallet.methods.transfer({
			secretKey: this.hexToBytes(walletSinger.secretKey),
			toAddress: recipientAddress,
			amount: amountNano,
			seqno,
			payload,
			stateInit,
			sendMode: SendMode.SenderPaysForwardFees | SendMode.IgnoreErrors,
		})

		const response: Send | Error = await request.send()
		if (response["@type"] === "error") {
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
		}
	}

	private bytesToHex(bytes: Uint8Array): string {
		return Buffer.from(bytes).toString("hex")
	}

	private hexToBytes(hex: string): Uint8Array {
		return Uint8Array.from(Buffer.from(hex, "hex"))
	}
}
