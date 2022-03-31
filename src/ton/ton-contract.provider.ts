import { Inject, Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import tonweb from "tonweb"
import { Cell } from "tonweb/dist/types/boc/cell"
import { JettonMinter } from "tonweb/dist/types/contract/token/ft/jetton-minter"
import { WalletContract } from "tonweb/dist/types/contract/wallet/wallet-contract"
import { HttpProvider } from "tonweb/dist/types/providers/http-provider"
import { Address, AddressType } from "tonweb/dist/types/utils/address"
import { Error, Send } from "ton-node"
import nacl from "tweetnacl"
import { JETTON_CONTENT_URI, TON_CONNECTION, USDJ_DECIMALS } from "./constants"
import { MinterData } from "./interfaces/minter-data.interface"
import { TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { WalletSigner } from "./interfaces/wallet-signer.interface"
import { TonBlockchainProvider } from "./ton-blockchain.provider"
import { WalletData } from "./interfaces/wallet-data.interface"

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

	constructor(
		@Inject(TON_CONNECTION) options: TonModuleOptions,
		private readonly tonBlockchain: TonBlockchainProvider,
	) {
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

	async transfer(
		walletSinger: WalletSigner,
		recipientAddress: AddressType,
		amount: BigNumber,
		payload?: string | Cell,
		stateInit?: Cell,
	): Promise<void> {
		const seqno = (await walletSinger.wallet.methods.seqno().call()) || 0

		const request = walletSinger.wallet.methods.transfer({
			secretKey: this.hexToBytes(walletSinger.secretKey),
			toAddress: recipientAddress,
			amount: tonweb.utils.toNano(amount.toString()),
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

	async deployMinter(adminWalletSigner: WalletSigner, transferAmount: BigNumber): Promise<void> {
		const adminAddress = await adminWalletSigner.wallet.getAddress()
		const minter = this.createMinter(adminAddress)
		const minterAddress = await minter.getAddress()

		const { stateInit } = await minter.createStateInit()
		await this.transfer(adminWalletSigner, minterAddress, transferAmount, undefined, stateInit)
	}

	async mintTokens(
		adminWalletSigner: WalletSigner,
		jettonAmount: BigNumber,
		adminTransferAmount: BigNumber,
		minterTransferAmount: BigNumber,
	): Promise<void> {
		const adminAddress = await adminWalletSigner.wallet.getAddress()
		const minter = this.createMinter(adminAddress)
		const minterAddress = await minter.getAddress()

		const payload = minter.createMintBody({
			destination: adminAddress,
			tokenAmount: tonweb.utils.toNano(jettonAmount.toString()),
			amount: tonweb.utils.toNano(minterTransferAmount.toString()),
		})
		await this.transfer(adminWalletSigner, minterAddress, adminTransferAmount, payload)
	}

	async getWalletData(walletSinger: WalletSigner): Promise<WalletData> {
		const address = await walletSinger.wallet.getAddress()
		const data = await this.tonBlockchain.getWalletInfo(address)
		return {
			walletType: data.walletType,
			balance: data.balance,
			accountState: data.accountState,
			seqno: data.seqno,
		}
	}

	async getMinterData(adminWalletSigner: WalletSigner): Promise<MinterData> {
		const adminAddress = await adminWalletSigner.wallet.getAddress()
		const adminBalance = await this.tonBlockchain.getBalance(adminAddress)

		const minter = this.createMinter(adminAddress)
		const minterAddress = await minter.getAddress()
		const minterBalance = await this.tonBlockchain.getBalance(minterAddress)

		const data = await minter.getJettonData()
		return {
			totalSupply: new BigNumber(data.totalSupply.toString()).div(10 ** USDJ_DECIMALS),
			minterAddress,
			minterBalance,
			adminAddress,
			adminBalance,
			jettonContentUri: data.jettonContentUri,
			isMutable: data.isMutable,
		}
	}

	private createMinter(adminAddress: Address): JettonMinter {
		const { JettonMinter, JettonWallet } = tonweb.token.jetton
		return new JettonMinter(this.httpProvider, {
			adminAddress,
			jettonContentUri: JETTON_CONTENT_URI,
			jettonWalletCodeHex: JettonWallet.codeHex,
			wc: this.workchain as 0,
		})
	}

	private bytesToHex(bytes: Uint8Array): string {
		return Buffer.from(bytes).toString("hex")
	}

	private hexToBytes(hex: string): Uint8Array {
		return Uint8Array.from(Buffer.from(hex, "hex"))
	}
}
