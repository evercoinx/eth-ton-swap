import { Inject, Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Error, Fees, Send } from "toncenter-rpc"
import tonweb from "tonweb"
import { Cell } from "tonweb/dist/types/boc/cell"
import { JettonMinter } from "tonweb/dist/types/contract/token/ft/jetton-minter"
import { JettonWallet } from "tonweb/dist/types/contract/token/ft/jetton-wallet"
import { WalletContract } from "tonweb/dist/types/contract/wallet/wallet-contract"
import { HttpProvider } from "tonweb/dist/types/providers/http-provider"
import { Address, AddressType } from "tonweb/dist/types/utils/address"
import tonMnemonic = require("tonweb-mnemonic")
import nacl from "tweetnacl"
import { SecurityService } from "src/common/providers/security.service"
import { JETTON_DECIMALS, TON_CONNECTION_TOKEN } from "../constants"
import { SendMode } from "../enums/send-mode.enum"
import { JettonMinterData } from "../interfaces/jetton-minter-data.interface"
import { TonModuleOptions } from "../interfaces/ton-module-options.interface"
import { WalletSigner } from "../interfaces/wallet-signer.interface"
import { TonBlockchainService } from "./ton-blockchain.service"
import { JettonWalletData } from "../interfaces/jetton-wallet-data.interface"

@Injectable()
export class TonContractService {
	private readonly httpProvider: HttpProvider
	private readonly walletClass: typeof WalletContract
	private readonly workchain: number
	private readonly jettonContentUri: URL

	constructor(
		@Inject(TON_CONNECTION_TOKEN) options: TonModuleOptions,
		private readonly tonBlockchain: TonBlockchainService,
		private readonly security: SecurityService,
	) {
		const host = `https://${
			options.blockchainId === "testnet" ? "testnet." : ""
		}toncenter.com/api/v2/jsonRPC`
		this.httpProvider = new tonweb.HttpProvider(host, { apiKey: options.apiKey })

		this.workchain = options.workchain
		this.jettonContentUri = options.jettonContentUri

		const wallets = new tonweb.Wallets(this.httpProvider)
		this.walletClass = wallets.all[options.walletVersion]
	}

	async createWalletSigner(encryptedSecretKey: string): Promise<WalletSigner> {
		const decryptedSecretKey = await this.security.decryptText(encryptedSecretKey)
		const keyPair = nacl.sign.keyPair.fromSecretKey(this.hexToBytes(decryptedSecretKey))
		const wallet = new this.walletClass(this.httpProvider, {
			publicKey: keyPair.publicKey,
			wc: this.workchain,
		})
		return {
			wallet,
			secretKey: decryptedSecretKey,
		}
	}

	async createRandomWalletSigner(): Promise<WalletSigner> {
		const mnemonic = await tonMnemonic.generateMnemonic()

		const keyPair = await tonMnemonic.mnemonicToKeyPair(mnemonic)

		const wallet = new this.walletClass(this.httpProvider, {
			publicKey: keyPair.publicKey,
			wc: this.workchain,
		})
		return {
			wallet,
			secretKey: this.bytesToHex(keyPair.secretKey),
			mnemonic,
		}
	}

	async transfer(
		walletSigner: WalletSigner,
		destinationAddressAny: AddressType,
		transferAmount: BigNumber,
		bounceable: boolean,
		payload?: string | Cell,
		stateInit?: Cell,
		dryRun = false,
	): Promise<BigNumber | undefined> {
		const seqno = (await walletSigner.wallet.methods.seqno().call()) || 0

		const destinationAddress = new tonweb.Address(destinationAddressAny).toString(
			true,
			true,
			bounceable,
		)
		const request = walletSigner.wallet.methods.transfer({
			secretKey: this.hexToBytes(walletSigner.secretKey),
			toAddress: destinationAddress,
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

	async deployWallet(walletSigner: WalletSigner, dryRun = false): Promise<BigNumber | undefined> {
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
		dryRun = false,
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
		destinationAddressAny: AddressType,
		jettonAmount: BigNumber,
		transferAmount: BigNumber,
		mintAmount: BigNumber,
		dryRun = false,
	): Promise<BigNumber | undefined> {
		const adminWalletAddress = await adminWalletSigner.wallet.getAddress()
		const jettonMinter = this.createJettonMinter(adminWalletAddress)
		const jettonMinterAddress = await jettonMinter.getAddress()

		const payload = jettonMinter.createMintBody({
			destination: new tonweb.Address(destinationAddressAny),
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
		adminWalletAddressAny: AddressType,
		destinationAddressAny: AddressType,
		jettonAmount: BigNumber,
		transferAmount: BigNumber,
		forwardAmount?: BigNumber,
		forwardPayload?: string,
		dryRun = false,
	): Promise<BigNumber | undefined> {
		const ownerWalletAddress = await ownerWalletSigner.wallet.getAddress()
		const jettonWallet = this.createJettonWallet(ownerWalletAddress)

		const jettonMinter = this.createJettonMinter(new tonweb.Address(adminWalletAddressAny))
		const conjugatedWalletAddress = await jettonMinter.getWalletAddress(ownerWalletAddress)

		const payload = await jettonWallet.createTransferBody({
			jettonAmount: tonweb.utils.toNano(jettonAmount.toString()),
			toAddress: new tonweb.Address(destinationAddressAny),
			forwardAmount: forwardAmount
				? tonweb.utils.toNano(forwardAmount.toString())
				: undefined,
			forwardPayload: forwardPayload ? new TextEncoder().encode(forwardPayload) : undefined,
			responseAddress: ownerWalletAddress,
		} as any)

		return await this.transfer(
			ownerWalletSigner,
			conjugatedWalletAddress,
			transferAmount,
			true,
			payload,
			undefined,
			dryRun,
		)
	}

	async burnJettons(
		ownerWalletSigner: WalletSigner,
		adminWalletAddressAny: AddressType,
		jettonAmount: BigNumber,
		transferAmount: BigNumber,
		dryRun = false,
	): Promise<BigNumber | undefined> {
		const ownerWalletAddress = await ownerWalletSigner.wallet.getAddress()
		const jettonWallet = this.createJettonWallet(ownerWalletAddress)

		const jettonMinter = this.createJettonMinter(new tonweb.Address(adminWalletAddressAny))
		const conjugatedWalletAddress = await jettonMinter.getWalletAddress(ownerWalletAddress)

		const payload = await jettonWallet.createBurnBody({
			jettonAmount: tonweb.utils.toNano(jettonAmount.toString()),
			responseAddress: ownerWalletAddress,
		} as any)

		return await this.transfer(
			ownerWalletSigner,
			conjugatedWalletAddress,
			transferAmount,
			true,
			payload,
			undefined,
			dryRun,
		)
	}

	async getJettonMinterData(adminWalletAddressAny: AddressType): Promise<JettonMinterData> {
		const adminWalletAddress = new tonweb.Address(adminWalletAddressAny)
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
			adminWalletAddress: adminWalletAddress,
			adminWalletBalance,
			jettonContentUri: jettonData.jettonContentUri,
			isMutable: jettonData.isMutable,
		}
	}

	async getJettonWalletData(jettonWalletAddressAny: AddressType): Promise<JettonWalletData> {
		const jettonWalletAddress = new tonweb.Address(jettonWalletAddressAny)
		const jettonWallet = this.createJettonWallet(jettonWalletAddress)
		const data = await jettonWallet.getData()

		return {
			balance: new BigNumber(tonweb.utils.fromNano(data.balance)),
			ownerAddress: data.ownerAddress,
			jettonMinterAddress: data.jettonMinterAddress,
		}
	}

	async getJettonWalletAddress(
		adminWalletAddressAny: AddressType,
		ownerWalletAddressAny: AddressType,
	): Promise<Address> {
		const adminWalletAddress = new tonweb.Address(adminWalletAddressAny)
		const jettonMinter = this.createJettonMinter(adminWalletAddress)

		const ownerWalletAddress = new tonweb.Address(ownerWalletAddressAny)
		return await jettonMinter.getWalletAddress(ownerWalletAddress)
	}

	private createJettonMinter(adminAddress: Address): JettonMinter {
		const { JettonMinter, JettonWallet } = tonweb.token.jetton
		return new JettonMinter(this.httpProvider, {
			adminAddress,
			jettonContentUri: this.jettonContentUri.toString().replace(/\/$/, ""),
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
