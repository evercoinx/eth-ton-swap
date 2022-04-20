import { Inject, Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import tonweb from "tonweb"
import { Cell } from "tonweb/dist/types/boc/cell"
import { JettonMinter } from "tonweb/dist/types/contract/token/ft/jetton-minter"
import { JettonWallet } from "tonweb/dist/types/contract/token/ft/jetton-wallet"
import { WalletContract } from "tonweb/dist/types/contract/wallet/wallet-contract"
import { HttpProvider } from "tonweb/dist/types/providers/http-provider"
import { Address, AddressType } from "tonweb/dist/types/utils/address"
import { Error, Fees, Send } from "toncenter-rpc"
import nacl from "tweetnacl"
import { JETTON_CONTENT_URI, JETTON_DECIMALS, TON_CONNECTION } from "./constants"
import { JettonMinterData } from "./interfaces/jetton-minter-data.interface"
import { TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { VoidWalletSigner, WalletSigner } from "./interfaces/wallet-signer.interface"
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

	createVoidWalletSigner(address: AddressType): VoidWalletSigner {
		const wallet = new this.walletClass(this.httpProvider, {
			address,
			wc: this.workchain,
		})

		return {
			wallet,
		}
	}

	createWalletSigner(secretKey: string): WalletSigner {
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

	createRandomWalletSigner(): WalletSigner {
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
		walletSigner: WalletSigner,
		destinationAddress: AddressType,
		transferAmount: BigNumber,
		bounceable: boolean,
		payload?: string | Cell,
		stateInit?: Cell,
		dryRun = false,
	): Promise<BigNumber | undefined> {
		const seqno = (await walletSigner.wallet.methods.seqno().call()) || 0

		const request = walletSigner.wallet.methods.transfer({
			secretKey: this.hexToBytes(walletSigner.secretKey),
			toAddress: new tonweb.Address(destinationAddress).toString(true, true, bounceable),
			amount: tonweb.utils.toNano(transferAmount.toString()),
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
			return this.calculateTotalFee(response)
		}

		const response: Send | Error = await request.send()
		if (response["@type"] === "error") {
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
		}
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
		const adminWalletAddress = await adminWalletSigner.wallet.getAddress()
		const jettonMinter = this.createJettonMinter(adminWalletAddress)
		const jettonMinterAddress = await jettonMinter.getAddress()
		const { stateInit } = await jettonMinter.createStateInit()

		return await this.transfer(
			adminWalletSigner,
			jettonMinterAddress.toString(true, true, true),
			transferAmount,
			true,
			undefined,
			stateInit,
			dryRun,
		)
	}

	async mintJettons(
		adminWalletSigner: WalletSigner,
		destinationAddress: AddressType,
		jettonAmount: BigNumber,
		transferAmount: BigNumber,
		mintAmount: BigNumber,
		dryRun: boolean,
	): Promise<BigNumber | undefined> {
		const adminWalletAddress = await adminWalletSigner.wallet.getAddress()
		const jettonMinter = this.createJettonMinter(adminWalletAddress)
		const jettonMinterAddress = await jettonMinter.getAddress()

		const payload = jettonMinter.createMintBody({
			destination: new tonweb.Address(destinationAddress),
			jettonAmount: tonweb.utils.toNano(jettonAmount.toString()),
			amount: tonweb.utils.toNano(mintAmount.toString()),
		} as any)

		return await this.transfer(
			adminWalletSigner,
			jettonMinterAddress.toString(true, true, true),
			transferAmount,
			true,
			payload,
			undefined,
			dryRun,
		)
	}

	async transferJettons(
		ownerWalletSigner: WalletSigner,
		adminWalletAddress: AddressType,
		destinationAddress: AddressType,
		jettonAmount: BigNumber,
		transferAmount: BigNumber,
		forwardAmount?: BigNumber,
		forwardPayload?: string,
		dryRun = false,
	): Promise<BigNumber | undefined> {
		const ownerWalletAddress = await ownerWalletSigner.wallet.getAddress()
		const jettonWallet = this.createJettonWallet(ownerWalletAddress)

		const payload = await jettonWallet.createTransferBody({
			jettonAmount: tonweb.utils.toNano(jettonAmount.toString()),
			toAddress: new tonweb.Address(destinationAddress),
			forwardAmount: forwardAmount
				? tonweb.utils.toNano(forwardAmount.toString())
				: undefined,
			forwardPayload: forwardPayload ? new TextEncoder().encode(forwardPayload) : undefined,
			responseAddress: ownerWalletAddress,
		} as any)

		const adminWalletSigner = this.createVoidWalletSigner(adminWalletAddress)
		const sourceAddress = await this.getJettonWalletAddress(
			adminWalletSigner,
			ownerWalletAddress,
		)

		return await this.transfer(
			ownerWalletSigner,
			sourceAddress,
			transferAmount,
			true,
			payload,
			undefined,
			dryRun,
		)
	}

	async getWalletData(walletSigner: VoidWalletSigner): Promise<WalletData> {
		const address = await walletSigner.wallet.getAddress()
		return await this.tonBlockchain.getWalletData(address)
	}

	async getJettonMinterData(adminWalletSigner: VoidWalletSigner): Promise<JettonMinterData> {
		const adminWalletAddress = await adminWalletSigner.wallet.getAddress()
		const adminWalletBalance = await this.tonBlockchain.getBalance(adminWalletAddress)

		const jettonMinter = this.createJettonMinter(adminWalletAddress)
		const jettonMinterAddress = await jettonMinter.getAddress()
		const jettonMinterBalance = await this.tonBlockchain.getBalance(jettonMinterAddress)

		const jettonData = await jettonMinter.getJettonData()
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

	async getJettonWalletData(walletSigner: VoidWalletSigner): Promise<JettonWalletData> {
		const address = await walletSigner.wallet.getAddress()
		const jettonWallet = this.createJettonWallet(address)
		const data = await jettonWallet.getData()

		return {
			balance: new BigNumber(tonweb.utils.fromNano(data.balance)),
			ownerAddress: data.ownerAddress,
			jettonMinterAddress: data.jettonMinterAddress,
		}
	}

	async getJettonWalletAddress(
		adminWalletSigner: VoidWalletSigner,
		ownerAddress: AddressType,
	): Promise<Address> {
		const adminWalletAddress = await adminWalletSigner.wallet.getAddress()
		const jettonMinter = this.createJettonMinter(adminWalletAddress)
		return await jettonMinter.getWalletAddress(new tonweb.Address(ownerAddress))
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
		return new JettonWallet(this.httpProvider, { address })
	}

	private calculateTotalFee(fees: Fees): BigNumber {
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
