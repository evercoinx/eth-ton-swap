import { Inject, Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import tonweb from "tonweb"
import { Cell } from "tonweb/dist/types/boc/cell"
import { JettonMinter } from "tonweb/dist/types/contract/token/ft/jetton-minter"
import { JettonWallet } from "tonweb/dist/types/contract/token/ft/jetton-wallet"
import { WalletContract } from "tonweb/dist/types/contract/wallet/wallet-contract"
import { HttpProvider } from "tonweb/dist/types/providers/http-provider"
import { Address, AddressType } from "tonweb/dist/types/utils/address"
import { Error, Fees, Send } from "ton-node"
import nacl from "tweetnacl"
import { JETTON_CONTENT_URI, JETTON_DECIMALS, TON_CONNECTION } from "./constants"
import { JettonMinterData } from "./interfaces/jetton-minter-data.interface"
import { TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { WalletSigner } from "./interfaces/wallet-signer.interface"
import { TonBlockchainProvider } from "./ton-blockchain.provider"
import { WalletData } from "./interfaces/wallet-data.interface"
import { JettonWalletData } from "./interfaces/jetton-wallet-data.interface"

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
		toAddress: AddressType,
		amount: BigNumber,
		bounceable: boolean,
		payload?: string | Cell,
		stateInit?: Cell,
		dryRun = false,
	): Promise<BigNumber | undefined> {
		const seqno = (await walletSinger.wallet.methods.seqno().call()) || 0

		const request = walletSinger.wallet.methods.transfer({
			secretKey: this.hexToBytes(walletSinger.secretKey),
			toAddress: new tonweb.Address(toAddress).toString(true, true, bounceable),
			amount: tonweb.utils.toNano(amount.toString()),
			seqno,
			payload,
			stateInit,
			sendMode: SendMode.SenderPaysForwardFees | SendMode.IgnoreErrors,
		})

		if (dryRun) {
			const response: Fees | Error = await request.estimateFee()
			if (response["@type"] === "error") {
				throw new Error(`Code: ${response.code}. Message: ${response.message}`)
			}
			return this.calculateTransacitonFee(response)
		}

		const response: Send | Error = await request.send()
		if (response["@type"] === "error") {
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
		}
	}

	async transferJettons(
		walletSinger: WalletSigner,
		destinationAddress: AddressType,
		jettonAmount: BigNumber,
		transferAmount: BigNumber,
		dryRun = false,
	): Promise<BigNumber | undefined> {
		const sourceAddress = await walletSinger.wallet.getAddress()
		const jettonWallet = this.createJettonWallet(sourceAddress)

		const payload = await jettonWallet.createTransferBody({
			tokenAmount: tonweb.utils.toNano(jettonAmount.toString()),
			toAddress: new tonweb.Address(destinationAddress),
			forwardAmount: tonweb.utils.toNano(0.1),
			forwardPayload: new TextEncoder().encode("test"),
			responseAddress: sourceAddress,
		})

		return await this.transfer(
			walletSinger,
			sourceAddress,
			transferAmount,
			true,
			payload,
			undefined,
			dryRun,
		)
	}

	async deployWallet(
		walletSigner: WalletSigner,
		dryRun: boolean,
	): Promise<BigNumber | undefined> {
		const address = await walletSigner.wallet.getAddress()

		const { stateInit } = await walletSigner.wallet.createStateInit()
		return await this.transfer(
			walletSigner,
			address.toString(true, true, true),
			new BigNumber(0),
			true,
			undefined,
			stateInit,
			dryRun,
		)
	}

	async deployJettonMinter(
		adminWalletSigner: WalletSigner,
		transferAmount: BigNumber,
		dryRun: boolean,
	): Promise<BigNumber | undefined> {
		const adminAddress = await adminWalletSigner.wallet.getAddress()
		const minter = this.createJettonMinter(adminAddress)
		const minterAddress = await minter.getAddress()

		const { stateInit } = await minter.createStateInit()
		return await this.transfer(
			adminWalletSigner,
			minterAddress.toString(true, true, true),
			transferAmount,
			true,
			undefined,
			stateInit,
			dryRun,
		)
	}

	async mintJettons(
		adminWalletSigner: WalletSigner,
		tokenAmount: BigNumber,
		adminTransferAmount: BigNumber,
		minterTransferAmount: BigNumber,
		dryRun: boolean,
	): Promise<BigNumber | undefined> {
		const adminAddress = await adminWalletSigner.wallet.getAddress()
		const minter = this.createJettonMinter(adminAddress)
		const minterAddress = await minter.getAddress()

		const payload = minter.createMintBody({
			destination: adminAddress,
			amount: tonweb.utils.toNano(minterTransferAmount.toString()),
			tokenAmount: tonweb.utils.toNano(tokenAmount.toString()),
		})
		return await this.transfer(
			adminWalletSigner,
			minterAddress,
			adminTransferAmount,
			true,
			payload,
			undefined,
			dryRun,
		)
	}

	async getWalletData(walletSinger: WalletSigner): Promise<WalletData> {
		const address = await walletSinger.wallet.getAddress()
		const info = await this.tonBlockchain.getWalletInfo(address)
		return {
			address: info.address,
			balance: info.balance,
			accountState: info.accountState,
			walletType: info.walletType,
			seqno: info.seqno,
		}
	}

	async getJettonMinterData(adminWalletSigner: WalletSigner): Promise<JettonMinterData> {
		const adminWalletAddress = await adminWalletSigner.wallet.getAddress()
		const adminWalletBalance = await this.tonBlockchain.getBalance(adminWalletAddress)

		const minter = this.createJettonMinter(adminWalletAddress)
		const jettonMinterAddress = await minter.getAddress()
		const jettonMinterBalance = await this.tonBlockchain.getBalance(jettonMinterAddress)

		const jettonData = await minter.getJettonData()
		const totalSupplyNano = jettonData.totalSupply.toString()
		return {
			totalSupply: new BigNumber(totalSupplyNano).div(10 ** JETTON_DECIMALS),
			jettonMinterAddress,
			jettonMinterBalance,
			adminWalletAddress,
			adminWalletBalance,
			jettonContentUri: jettonData.jettonContentUri,
			isMutable: jettonData.isMutable,
		}
	}

	async getJettonWalletData(walletSinger: WalletSigner): Promise<JettonWalletData> {
		const jettonWallet = this.createJettonWallet(await walletSinger.wallet.getAddress())

		const data = await jettonWallet.getData()
		return {
			balance: new BigNumber(tonweb.utils.fromNano(data.balance)),
			ownerAddress: data.ownerAddress,
			jettonMinterAddress: data.jettonMinterAddress,
		}
	}

	private createJettonMinter(adminAddress: Address): JettonMinter {
		const { JettonMinter, JettonWallet } = tonweb.token.jetton
		return new JettonMinter(this.httpProvider, {
			adminAddress,
			jettonContentUri: JETTON_CONTENT_URI,
			jettonWalletCodeHex: JettonWallet.codeHex,
			wc: this.workchain as 0,
		})
	}

	private createJettonWallet(address: Address): JettonWallet {
		const { JettonWallet } = tonweb.token.jetton
		return new JettonWallet(this.httpProvider, {
			address,
		})
	}

	private calculateTransacitonFee(fees: Fees): BigNumber {
		const sourceFees = fees["source_fees"]
		const feeNano =
			sourceFees.in_fwd_fee + sourceFees.storage_fee + sourceFees.gas_fee + sourceFees.fwd_fee
		return new BigNumber(tonweb.utils.fromNano(feeNano))
	}

	private bytesToHex(bytes: Uint8Array): string {
		return Buffer.from(bytes).toString("hex")
	}

	private hexToBytes(hex: string): Uint8Array {
		return Uint8Array.from(Buffer.from(hex, "hex"))
	}
}
