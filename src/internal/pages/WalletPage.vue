<template>
  <div class="flex flex-column w-full h-full bg-white overflow-hidden font-sans">
    
    <!-- HEADER -->
    <div class="flex flex-align-center flex-justify-between padding-left-100 padding-right-100 h-300 flex-0-0-auto z-2 border-bottom-1px border-color-light">
      <div class="flex flex-align-center gap-15" v-if="activeWallet">
        <div class="size-35 bg-blue-500 border-radius-circle flex-align-justify-center">
          <div class="size-12 bg-white border-radius-circle"></div>
        </div>
        <div class="flex flex-column">
          <span class="txt-md txt-weight-bold color-black">{{ activeWallet.name }}</span>
          <span class="txt-xs color-gray-400 font-mono">{{ truncateAddress(activeWallet.address) }}</span>
        </div>
      </div>
      <div v-else class="txt-weight-bold color-black">Lumen Wallet</div>
      <div class="flex flex-align-center gap-25 relative">
         <button class="icon-btn" title="Refresh" @click="refreshWallet">
            <RefreshCw :size="18" class="color-gray-500" :class="{ 'spin': isLoading }" />
         </button>
         <button class="icon-btn" title="Settings" @click="openSettings">
            <Settings :size="18" class="color-gray-500" />
         </button>
         
         <!-- Settings Dropdown -->
         <div v-if="showSettings" class="absolute top-100 right-0 bg-white border-1px border-color-light border-radius-10px shadow-lg min-w-250 z-10 animate-fade-in">
             <div class="padding-10">
                 <!-- Wallet List (if multiple wallets exist) -->
                 <div v-if="walletList.length > 1" class="margin-bottom-10 padding-bottom-10 border-bottom-1px border-color-light">
                     <div class="txt-xs txt-weight-bold color-gray-500 uppercase margin-bottom-10 padding-left-10">My Wallets</div>
                     <div v-for="w in walletList" :key="w.id" 
                          class="flex flex-align-center gap-10 padding-10 hover-bg-gray-50 border-radius-5px cursor-pointer transition-ui"
                          :class="{ 'bg-blue-50': w.id === activeWallet.id }"
                          @click="switchWallet(w)">
                         <div class="size-30 bg-blue-500 border-radius-circle flex-align-justify-center flex-shrink-0">
                             <div class="size-10 bg-white border-radius-circle"></div>
                         </div>
                         <div class="flex-1 overflow-hidden">
                             <div class="txt-sm txt-weight-medium color-black text-truncate">{{ w.name }}</div>
                             <div class="txt-xs color-gray-400 font-mono text-truncate">{{ truncateAddress(w.address) }}</div>
                         </div>
                         <button v-if="w.id === activeWallet.id" 
                                 class="icon-btn-small" 
                                 title="Rename" 
                                 @click.stop="startRename(w)">
                             <component :is="editingWalletId === w.id ? Check : Edit2" :size="14" class="color-gray-500" />
                         </button>
                     </div>
                 </div>

                 <!-- Actions -->
                 <button class="w-full text-left padding-10 hover-bg-gray-50 border-radius-5px cursor-pointer border-none bg-transparent color-black txt-sm flex flex-align-center gap-10" @click="requestReveal">
                     <ShieldCheck :size="16" />
                     Show Recovery Phrase
                 </button>
                 <button class="w-full text-left padding-10 hover-bg-gray-50 border-radius-5px cursor-pointer border-none bg-transparent color-blue-600 txt-sm flex flex-align-center gap-10" @click="openExportModal">
                     <ShieldCheck :size="16" />
                     Backup PQC Keys
                 </button>
                 <button class="w-full text-left padding-10 hover-bg-gray-50 border-radius-5px cursor-pointer border-none bg-transparent color-red-600 txt-sm flex flex-align-center gap-10" @click="confirmDeleteWallet">
                     <Trash2 :size="16" />
                     Delete Wallet
                 </button>
                 <button class="w-full text-left padding-10 hover-bg-gray-50 border-radius-5px cursor-pointer border-none bg-transparent color-red-600 txt-sm flex flex-align-center gap-10" @click="logout">
                     <LogOut :size="16" />
                     Log Out
                 </button>
             </div>
         </div>
       </div>
    </div>
    
    <!-- UNLOCK MODAL (For Reveal) -->
    <div v-if="showUnlock" class="fixed top-0 left-0 w-full h-full bg-black-50 backdrop-blur-sm z-50 flex flex-align-justify-center animate-fade-in">
        <div class="bg-white padding-30 border-radius-20px max-w-340 w-full shadow-xl transform-scale-in relative overflow-hidden">
            <!-- Decorative Background Element -->
            <div class="absolute top-0 left-0 w-full h-5 bg-gradient-to-r from-blue-400 to-blue-600"></div>

            <div class="flex flex-column flex-align-center text-center margin-top-15">
                <div class="size-300 bg-blue-50 border-radius-circle flex-align-justify-center margin-bottom-20 color-blue-500">
                    <ShieldCheck :size="32" stroke-width="2" />
                </div>
                
                <h3 class="txt-lg txt-weight-bold color-black margin-bottom-10">Verification Required</h3>
                <p class="txt-sm color-gray-500 margin-bottom-30 line-height-150">
                    Enter your wallet password to decrypt and reveal your sensitive recovery phrase.
                </p>
            </div>
            
            <div class="relative margin-bottom-20">
                <div class="absolute top-0 bottom-0 left-0 padding-left-15 flex flex-align-center pointer-events-none">
                    <component :is="activeWallet ? ShieldCheck : ShieldCheck" :size="18" class="color-gray-400" />
                </div>
                <!-- Reuse input-field but add padding left for icon -->
                <input 
                    type="password" 
                    v-model="password" 
                    class="input-field padding-left-45" 
                    placeholder="Enter Password"
                    @keyup.enter="confirmReveal"
                    autofocus
                />
            </div>
            
            <div v-if="error" class="bg-red-50 color-red-600 padding-10 border-radius-8px txt-xs margin-bottom-20 text-center flex flex-align-center flex-justify-center gap-5">
                <ShieldAlert :size="14" />
                <span>{{ error }}</span>
            </div>

            <div class="grid grid-cols-2 gap-15">
                <button class="btn-ghost bg-gray-50 hover-bg-gray-100 color-gray-600 border-radius-10px txt-weight-medium" @click="showUnlock = false">
                    Cancel
                </button>
                <button class="btn-primary border-radius-10px shadow-md" @click="confirmReveal">
                    Reveal
                </button>
            </div>
        </div>
    </div>

    <!-- MODAL: SEND TRANSACTION -->
    <div v-if="showSendModal" class="absolute w-full h-full top-0 left-0 z-20 flex-align-justify-center bg-black-50 backdrop-blur-sm">
        <div class="bg-white border-radius-20px shadow-2xl padding-100 max-w-450 w-full animate-scale-in">
            <div class="flex flex-column flex-align-center gap-25 margin-bottom-50">
                <div class="size-60 bg-blue-100 border-radius-circle flex-align-justify-center mx-auto">
                    <ArrowUpRight :size="28" class="color-blue-600" />
                </div>
                <h3 class="txt-lg txt-weight-bold color-black text-center">Send LMN</h3>
            </div>

            <div class="flex flex-column gap-20">
                <!-- Recipient Address -->
                <div class="flex flex-column gap-10">
                    <label class="txt-xs txt-weight-bold color-gray-500 uppercase">Recipient Address</label>
                    <input 
                        type="text" 
                        v-model="sendForm.toAddress" 
                        class="input-field font-mono txt-sm" 
                        placeholder="lmn1..."
                    />
                </div>

                <!-- Amount -->
                <div class="flex flex-column gap-10">
                    <div class="flex flex-justify-between flex-align-center">
                        <label class="txt-xs txt-weight-bold color-gray-500 uppercase">Amount</label>
                        <span class="txt-xs color-gray-400">Available: {{ assets[0]?.amount.toFixed(4) || '0.00' }} LMN</span>
                    </div>
                    <div class="relative">
                        <input 
                            type="number" 
                            v-model="sendForm.amount" 
                            class="input-field" 
                            placeholder="0.001"
                            step="0.001"
                            min="0.001"
                        />
                        <span class="absolute right-15 top-50-translate-y txt-sm color-gray-500">LMN</span>
                    </div>
                </div>

                <!-- Memo (Optional) -->
                <div class="flex flex-column gap-10">
                    <label class="txt-xs txt-weight-bold color-gray-500 uppercase">Memo (Optional)</label>
                    <input 
                        type="text" 
                        v-model="sendForm.memo" 
                        class="input-field" 
                        placeholder="Add a note..."
                    />
                </div>

                <!-- Password -->
                <div class="flex flex-column gap-10">
                    <label class="txt-xs txt-weight-bold color-gray-500 uppercase">Password</label>
                    <input 
                        type="password" 
                        v-model="sendForm.password" 
                        class="input-field" 
                        placeholder="Confirm with password"
                        @keyup.enter="executeSend"
                    />
                </div>

                <!-- Error Message -->
                <div v-if="sendError" class="bg-red-50 color-red-600 padding-15 border-radius-10px txt-xs">
                    {{ sendError }}
                </div>

                <!-- Success Message -->
                <div v-if="sendSuccess" class="bg-green-50 color-green-600 padding-15 border-radius-10px txt-xs">
                    <div class="txt-weight-bold margin-bottom-5">Transaction Sent!</div>
                    <div class="font-mono text-truncate">{{ sendSuccess }}</div>
                </div>

                <!-- Action Buttons -->
                <div class="flex gap-15 margin-top-10">
                    <button class="btn-ghost flex-1" @click="closeSendModal" :disabled="isSending">
                        Cancel
                    </button>
                    <button class="btn-primary flex-1" @click="executeSend" :disabled="!canSend || isSending">
                        <div v-if="isSending" class="flex flex-align-center gap-10">
                            <Loader2 :size="18" class="spin" />
                            <span>Sending...</span>
                        </div>
                        <span v-else>Send</span>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- MODAL: EXPORT PQC KEYS -->
    <div v-if="showExportModal" class="fixed top-0 left-0 w-full h-full z-20 flex flex-align-justify-center backdrop-blur-sm bg-black-50">
        <div class="bg-white border-radius-20px shadow-xl max-w-600 w-full animate-fade-in overflow-hidden">
            <!-- Header -->
            <div class="padding-30 border-bottom-1px border-color-light flex flex-justify-between flex-align-center bg-gray-50">
                <h3 class="txt-lg color-black flex flex-align-center gap-10">
                    <ShieldCheck :size="24" class="color-blue-600" />
                    Backup PQC Keys
                </h3>
                <button class="icon-btn" @click="closeExportModal">✖</button>
            </div>

            <!-- Content -->
            <div class="padding-30">
                
                <div v-if="!exportedJson">
                    <p class="txt-sm color-gray-500 margin-bottom-25">
                        Please enter your password to decrypt and export your Post-Quantum keys.
                    </p>

                    <div class="flex flex-column gap-10 margin-bottom-25">
                        <label class="txt-xs txt-weight-bold color-gray-500 uppercase">Password</label>
                        <input 
                            type="password" 
                            v-model="exportPassword" 
                            class="input-field" 
                            placeholder="Unlock wallet..."
                            @keyup.enter="executeExport"
                        />
                    </div>

                    <div v-if="exportError" class="bg-red-50 color-red-600 padding-15 border-radius-10px txt-xs margin-bottom-25">
                        {{ exportError }}
                    </div>

                    <div class="flex gap-15">
                        <button class="btn-ghost flex-1" @click="closeExportModal" :disabled="isExporting">Cancel</button>
                        <button class="btn-primary flex-1" @click="executeExport" :disabled="!exportPassword || isExporting">
                             <div v-if="isExporting" class="flex flex-align-center gap-10">
                                <Loader2 :size="18" class="spin" />
                                <span>Decrypting...</span>
                            </div>
                            <span v-else>Export Keys</span>
                        </button>
                    </div>
                </div>

                <div v-else>
                    <div class="flex flex-column gap-15">
                        <div class="bg-blue-50 border-1px border-color-blue-200 border-radius-15px padding-20">
                             <div class="flex flex-justify-between flex-align-center margin-bottom-15">
                                <label class="txt-xs txt-weight-bold color-blue-700 uppercase">PQC JSON Backup</label>
                                <button class="padding-5-10 bg-white border-radius-5px cursor-pointer hover-bg-gray-100 border-1px border-color-blue-200 flex flex-align-center gap-5" @click="copy(exportedJson, 'export')">
                                    <component :is="copiedTarget === 'export' ? Check : Copy" :size="12" :class="copiedTarget === 'export' ? 'color-green-mint' : 'color-blue-500'" />
                                    <span class="txt-xs" :class="copiedTarget === 'export' ? 'color-green-mint' : 'color-blue-600'">{{ copiedTarget === 'export' ? 'Copied' : 'Copy JSON' }}</span>
                                </button>
                            </div>
                            <div class="w-full font-mono txt-xs color-blue-800 bg-white padding-15 border-radius-8px h-200 overflow-y-auto line-height-150 border-1px border-color-blue-100 shadow-sm whitespace-pre">
                                {{ exportedJson }}
                            </div>
                        </div>

                        <div class="bg-yellow-50 color-yellow-700 padding-15 border-radius-10px txt-xs border-1px border-color-yellow-200 flex gap-10">
                            <ShieldAlert :size="16" />
                            <span>Warning: This file grants full access to your funds. Store it safely offline.</span>
                        </div>

                        <button class="btn-primary w-full" @click="closeExportModal">Done</button>
                    </div>
                </div>

            </div>
        </div>
    </div>

    <!-- CONTENT: BACKUP (Sensitive Data) -->
    <div v-if="showBackup" class="flex-1 flex flex-justify-center padding-50 bg-white z-10 absolute w-full h-full top-0 left-0 overflow-y-auto">
         <div class="max-w-700 w-full flex flex-column animate-fade-in padding-bottom-100 h-fit">
            <div class="text-center margin-bottom-30">
                <div class="size-60 mx-auto bg-red-50 border-radius-circle flex-align-justify-center margin-bottom-15 flex">
                    <ShieldAlert :size="28" class="color-red-600" />
                </div>
                <h2 class="txt-lg color-black margin-bottom-5">Backup Wallet</h2>
                <p class="txt-xs color-gray-500">
                    Write these down on paper. Use the copy buttons for digital backup.
                </p>
            </div>

            <!-- Mnemonic Box -->
            <div class="w-full bg-gray-50 border-1px border-color-light border-radius-15px padding-20 margin-bottom-20 relative group">
                <div class="flex flex-justify-between flex-align-center margin-bottom-25">
                    <label class="txt-xs txt-weight-bold color-gray-500 uppercase block">Recovery Phrase</label>
                    <button class="padding-5-10 bg-white border-radius-5px cursor-pointer hover-bg-gray-100 border-1px border-color-light flex flex-align-center gap-5 transition-ui" @click="copy(backupData.mnemonic, 'mnemonic')">
                         <component :is="copiedTarget === 'mnemonic' ? Check : Copy" :size="12" :class="copiedTarget === 'mnemonic' ? 'color-green-mint' : 'color-gray-500'" />
                         <span class="txt-xs" :class="copiedTarget === 'mnemonic' ? 'color-green-mint' : 'color-gray-500'">{{ copiedTarget === 'mnemonic' ? 'Copied' : 'Copy' }}</span>
                    </button>
                </div>
                
                <div class="grid grid-cols-4 gap-15">
                    <div v-for="(word, i) in backupData.mnemonic.split(' ')" :key="i" class="bg-white padding-10 border-radius-8px border-1px border-color-light txt-sm color-black flex gap-10 flex-align-center shadow-sm">
                        <span class="color-gray-300 select-none font-mono txt-xs w-20 text-right">{{ i+1 }}.</span>
                        <span class="font-mono txt-weight-medium">{{ word }}</span>
                    </div>
                </div>
            </div>

            <!-- PQC Key Box -->
             <div class="w-full bg-blue-50 border-1px border-color-blue-200 border-radius-15px padding-20 margin-bottom-30 relative">
                <div class="flex flex-justify-between flex-align-center margin-bottom-25">
                    <div class="flex flex-column gap-5">
                        <label class="txt-xs txt-weight-bold color-blue-700 uppercase block">PQC JSON Backup</label>
                        <span class="txt-xxs color-blue-500">Save this JSON file to restore your Post-Quantum keys</span>
                    </div>
                    <button class="padding-5-10 bg-white border-radius-5px cursor-pointer hover-bg-gray-100 border-1px border-color-blue-200 flex flex-align-center gap-5 transition-ui" @click="copy(backupData.keysBackup, 'pqc')">
                        <component :is="copiedTarget === 'pqc' ? Check : Copy" :size="12" :class="copiedTarget === 'pqc' ? 'color-green-mint' : 'color-blue-500'" />
                         <span class="txt-xs" :class="copiedTarget === 'pqc' ? 'color-green-mint' : 'color-blue-600'">{{ copiedTarget === 'pqc' ? 'Copied' : 'Copy JSON' }}</span>
                    </button>
                </div>
                
                <div class="flex flex-align-center">
                     <div class="w-full font-mono txt-xs color-blue-800 bg-white padding-15 border-radius-8px h-200 overflow-y-auto line-height-150 border-1px border-color-blue-100 shadow-sm whitespace-pre">
                        {{ backupData.keysBackup }}
                     </div>
                </div>
            </div>

            <button class="btn-primary" @click="finishBackup">
                I have saved these securely
            </button>
         </div>
    </div>

    <!-- CONTENT: LOGIN SCREEN (Has Wallet, Locked) -->
    <div v-else-if="!activeWallet && hasWallet" class="flex-1 flex flex-align-justify-center padding-100">
         <div class="max-w-400 w-full flex flex-column flex-align-center animate-fade-in text-center">
            
            <div class="size-400 bg-blue-50 border-radius-circle flex-align-justify-center margin-bottom-50">
                <ShieldCheck :size="48" class="color-blue-500" />
            </div>

            <h2 class="txt-xl color-black margin-bottom-25">Welcome Back</h2>
            <p class="txt-sm color-gray-400 margin-bottom-50 line-height-150">
                Select your wallet and enter password to unlock.
            </p>

            <div class="w-full flex flex-column gap-15 text-left">
                <!-- Wallet Selector -->
                <div class="flex flex-column gap-10">
                    <label class="txt-xs txt-weight-bold color-gray-500 uppercase">Select Wallet</label>
                    <select 
                        v-model="selectedWalletId" 
                        class="input-field"
                    >
                        <option value="" disabled>Choose a wallet...</option>
                        <option v-for="w in walletList" :key="w.id" :value="w.id">
                            {{ w.name }} ({{ truncateAddress(w.address) }})
                        </option>
                    </select>
                </div>

                <div class="flex flex-column gap-10">
                    <label class="txt-xs txt-weight-bold color-gray-500 uppercase">Password</label>
                    <input 
                        type="password" 
                        v-model="password" 
                        class="input-field" 
                        placeholder="Unlock wallet..."
                        @keyup.enter="login"
                        :disabled="!selectedWalletId"
                    />
                </div>

                <div v-if="error" class="bg-red-50 color-red-600 padding-15 border-radius-10px txt-xs">
                    {{ error }}
                </div>

                <button 
                    class="btn-primary margin-top-25" 
                    :disabled="!password || !selectedWalletId || isCreating"
                    @click="login"
                >
                    <div v-if="isCreating" class="flex flex-align-center gap-10">
                        <Loader2 :size="18" class="spin" />
                        <span>Unlocking...</span>
                    </div>
                    <span v-else>Unlock Wallet</span>
                </button>
                
                 <!-- Optional: Forgot Password / Reset -->
                 <div class="text-center margin-top-25">
                     <p class="txt-xs color-gray-400">
                         Forgot password? <span class="color-red-600 cursor-pointer hover-opacity-70" @click="hasWallet = false; activeWallet = null; password = ''; error = '';">Reset Wallet</span>
                     </p>
                 </div>
            </div>
        </div>
    </div>

    <!-- CONTENT: CREATE / UNLOCK (No Wallet) -->
    <div v-else-if="!activeWallet && !hasWallet" class="flex-1 flex flex-align-justify-center padding-100">
         <div class="max-w-400 w-full flex flex-column flex-align-center animate-fade-in text-center">
            
            <div class="size-400 bg-blue-50 border-radius-circle flex-align-justify-center margin-bottom-50">
                <ShieldCheck :size="48" class="color-blue-500" />
            </div>

            <h2 class="txt-xl color-black margin-bottom-25">Lumen Secure Wallet</h2>
            <p class="txt-sm color-gray-400 margin-bottom-100 line-height-150">
                Secured by Post-Quantum Cryptography (Dilithium3).<br>
                Create a new wallet or import an existing one.
            </p>

            <!-- Creation Form -->
            <!-- Toggle: Create vs Import -->
            <div class="w-full flex flex-column gap-25 text-left display-block">
                
                <!-- IMPORT FORM -->
                <div v-if="importWalletMode" class="flex flex-column gap-10 animate-fade-in">
                    <div class="flex flex-column gap-5">
                        <label class="txt-xs txt-weight-bold color-gray-500 uppercase">Recovery Phrase</label>
                        <textarea 
                            v-model="importMnemonic" 
                            class="input-field min-h-80 font-mono txt-sm" 
                            placeholder="Enter your 12 or 24 word recovery phrase..."
                        ></textarea>
                    </div>

                    <div class="flex flex-column gap-5">
                        <label class="txt-xs txt-weight-bold color-gray-500 uppercase">Quantum Private Key (Optional)</label>
                        <textarea 
                            v-model="importPqcKey" 
                            class="input-field h-fit min-h-50 font-mono txt-xs color-blue-800 break-all" 
                            placeholder="Paste your PQC Private Key (Base64 or Hex)..."
                        ></textarea>
                        <span class="txt-xs color-gray-400">Required if your account is already linked. Supports Base64 or Hex format.</span>
                    </div>

                    <div class="flex flex-column gap-5">
                        <label class="txt-xs txt-weight-bold color-gray-500 uppercase">Set New Password</label>
                        <input 
                            type="password" 
                            v-model="password" 
                            class="input-field" 
                            placeholder="Encrypt your keys..."
                        />
                    </div>

                    <div v-if="error" class="bg-red-50 color-red-600 padding-10 border-radius-10px txt-xs">
                        {{ error }}
                    </div>

                    <button 
                        class="btn-primary margin-top-5" 
                        :disabled="!password || !importMnemonic || isCreating"
                        @click="importWallet"
                    >
                         <div v-if="isCreating" class="flex flex-align-center gap-10">
                            <Loader2 :size="18" class="spin" />
                            <span>Importing & Generating PQC Keys...</span>
                        </div>
                        <span v-else>Import Wallet</span>
                    </button>

                    <button class="btn-ghost" @click="importWalletMode = false">
                        Cancel & Create New
                    </button>
                </div>

                <!-- CREATE FORM -->
                <div v-else class="flex flex-column gap-25 animate-fade-in">
                    <div class="flex flex-column gap-10">
                        <label class="txt-xs txt-weight-bold color-gray-500 uppercase">Set Password</label>
                        <input 
                            type="password" 
                            v-model="password" 
                            class="input-field" 
                            placeholder="Encrypt your keys..."
                        />
                    </div>

                    <div v-if="error" class="bg-red-50 color-red-600 padding-15 border-radius-10px txt-xs">
                        {{ error }}
                    </div>

                    <button 
                        class="btn-primary margin-top-25" 
                        :disabled="!password || isCreating"
                        @click="createWallet"
                    >
                        <div v-if="isCreating" class="flex flex-align-center gap-10">
                            <Loader2 :size="18" class="spin" />
                            <span>Initializing Quantum Security...</span>
                        </div>
                        <span v-else>Create New Wallet</span>
                    </button>

                    <button class="btn-ghost" @click="importWalletMode = true">
                        Import Existing Wallet
                    </button>
                </div>
            </div>

        </div>
    </div>

    <!-- CONTENT: DASHBOARD (Logged In) -->
    <div v-else class="flex-1 overflow-auto padding-left-50 padding-right-50 flex flex-column flex-align-center">
      <div class="w-full max-w-600 flex flex-column flex-align-center animate-fade-in margin-top-25">
        
        <!-- Address & Network Badge -->
        <div class="flex flex-align-center gap-15 padding-15 bg-blue-50 border-radius-pill border-1px border-color-blue-200 margin-bottom-25 cursor-pointer hover-bg-blue-100 transition-ui" title="Copy Address" @click="copyAddress">
            <div class="size-150 bg-blue-500 border-radius-circle flex-align-justify-center">
                 <Wallet :size="16" class="color-white" />
            </div>
             <span class="txt-xs color-blue-700 font-mono txt-weight-medium">{{ truncateAddress(activeWallet.address) }}</span>
             <component :is="copiedTarget === 'address' ? Check : Copy" :size="12" :class="copiedTarget === 'address' ? 'color-green-mint' : 'color-blue-500'" />
        </div>

        <!-- Total Balance -->
        <div class="flex flex-column flex-align-center margin-bottom-50">
            <span class="txt-sm color-gray-400 ls-wide uppercase txt-weight-medium">Total Balance</span>
            <div class="balance-text color-black margin-top-5">$0.00</div>
             <div class="flex flex-align-center gap-10 margin-top-5">
                <span class="badge-neutral txt-xs">--</span>
                <span class="txt-xs color-gray-400">New Wallet</span>
            </div>
        </div>

        <!-- Main Actions -->
        <div class="flex flex-align-center gap-50 margin-bottom-50">
            <button class="action-item group" @click="openSendModal">
                <div class="circle-btn bg-black color-white group-hover-scale">
                    <ArrowUpRight :size="20" stroke-width="2" />
                </div>
                <span class="label">Send</span>
            </button>
            <button class="action-item group" disabled style="opacity: 0.4; cursor: not-allowed;">
                <div class="circle-btn bg-gray-100 color-black">
                    <ArrowDownLeft :size="20" stroke-width="2" />
                </div>
                <span class="label">Receive</span>
            </button>
             <button class="action-item group" disabled style="opacity: 0.4; cursor: not-allowed;">
                <div class="circle-btn bg-gray-100 color-black">
                    <Layers :size="20" stroke-width="2" />
                </div>
                <span class="label">Stake</span>
            </button>
             <button class="action-item group" disabled style="opacity: 0.4; cursor: not-allowed;">
                <div class="circle-btn bg-gray-100 color-black">
                    <Vote :size="20" stroke-width="2" />
                </div>
                <span class="label">Vote</span>
            </button>
        </div>

        <!-- Assets List -->
        <div class="w-full flex flex-column gap-0">
             <div class="flex flex-align-center margin-bottom-25 border-bottom-1px border-color-light padding-bottom-25">
                <button class="tab-btn active">Tokens</button>
                <button class="tab-btn">NFTs</button>
                <button class="tab-btn">Activity</button>
            </div>

            <div v-for="asset in assets" :key="asset.symbol" class="asset-row flex flex-align-center padding-50 cursor-pointer border-radius-15px transition-ui bg-blue-50">
                <div class="size-50 flex-align-justify-center border-radius-circle margin-right-20 overflow-hidden bg-white">
                     <img :src="asset.logo" :alt="asset.name" class="w-full h-full object-cover" />
                </div>
                
                <div class="flex flex-column flex-1">
                    <span class="txt-md txt-weight-medium color-black">{{ asset.name }}</span>
                    <div class="flex flex-align-center gap-10">
                         <span class="txt-xs color-gray-400">{{ asset.price }}</span>
                         <span class="txt-xs color-blue-600 bg-blue-100 padding-left-10 padding-right-10 border-radius-5px">Native</span>
                    </div>
                </div>

                <div class="flex flex-column flex-align-end">
                    <span class="txt-md txt-weight-strong color-black">${{ asset.value.toFixed(2) }}</span>
                    <span class="txt-xs color-gray-400">{{ asset.amount.toFixed(6) }} {{ asset.symbol }}</span>
                </div>
            </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { 
    RefreshCw, Settings, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, History, 
    Copy, Layers, Vote, Coins, Gem, Atom, CircleDollarSign,
    ShieldCheck, ShieldAlert, Loader2, LogOut, Check, Edit2, Trash2, Wallet
} from 'lucide-vue-next';

// State
const activeWallet = ref<any>(null);
const walletList = ref<any[]>([]);
const selectedWalletId = ref(''); // For login wallet selection
const password = ref('');
const isCreating = ref(false);
const isLoading = ref(false);
const error = ref('');
const copiedTarget = ref(''); // Track which item is copied
const importWalletMode = ref(false);
const editingWalletId = ref('');

const hasWallet = ref(false); // New flag to check if wallet exists on disk

// Backup State
const showBackup = ref(false);
const showSettings = ref(false);
const showUnlock = ref(false);
const backupData = ref<any>(null);

// Mnemonic & PQC Import
const importMnemonic = ref('');
const importPqcKey = ref('');

// Send Transaction State
const showSendModal = ref(false);
const sendForm = ref({
    toAddress: '',
    amount: '',
    memo: '',
    password: ''
});
const sendError = ref('');
const sendSuccess = ref('');
const isSending = ref(false);

// Export PQC State
const showExportModal = ref(false);
const exportPassword = ref('');
const exportedJson = ref('');
const exportError = ref('');
const isExporting = ref(false);

// Mock Data
const assets = ref([
    { 
        symbol: 'LMN', 
        name: 'Lumen', 
        amount: 0.00, 
        value: 0.00, 
        price: '$0.00', 
        logo: 'https://avatars.githubusercontent.com/u/240815201?v=4'
    }
]);

// Initialize
onMounted(async () => {
    try {
        const wallets = await window.lumen.wallet.list();
        walletList.value = wallets || [];
        
        if (wallets && wallets.length > 0) {
            hasWallet.value = true;
            
            // Check for active session in localStorage
            const sessionWalletId = localStorage.getItem('lumen_active_wallet_id');
            if (sessionWalletId) {
                // Auto-login to last active wallet
                const wallet = wallets.find(w => w.id === sessionWalletId);
                if (wallet) {
                    activeWallet.value = wallet;
                    // Fetch balance after auto-login
                    setTimeout(() => fetchBalance(), 500);
                }
            }
        }
    } catch (e) {
        console.error('Failed to load wallets', e);
    }
});

async function login() {
    if (!password.value || !selectedWalletId.value) return;
    isCreating.value = true; 
    error.value = '';

    try {
        const res = await window.lumen.wallet.reveal({ id: selectedWalletId.value, password: password.value });
        
        if (res.ok) {
            // Password correct for selected wallet
            const wallets = await window.lumen.wallet.list();
            const wallet = wallets.find(w => w.id === selectedWalletId.value);
            
            activeWallet.value = wallet;
            walletList.value = wallets;
            password.value = '';
            selectedWalletId.value = '';
            
            // Save session to localStorage
            localStorage.setItem('lumen_active_wallet_id', wallet.id);
            
            // Fetch balance after login
            setTimeout(() => fetchBalance(), 500);
        } else {
            error.value = 'Incorrect Password';
        }
    } catch (e: any) {
        error.value = 'Login Failed';
    } finally {
        isCreating.value = false;
    }
}

function switchWallet(wallet: any) {
    activeWallet.value = wallet;
    showSettings.value = false;
    
    // Update session
    localStorage.setItem('lumen_active_wallet_id', wallet.id);
    
    // Fetch new wallet's balance
    setTimeout(() => fetchBalance(), 300);
}

function startRename(wallet: any) {
    const newName = prompt('Enter new wallet name:', wallet.name);
    if (newName && newName !== wallet.name) {
        renameWallet(wallet.id, newName);
    }
}

async function renameWallet(id: string, newName: string) {
    try {
        const res = await window.lumen.wallet.rename({ id, newName });
        if (res.ok) {
            // Update local state
            const wallet = walletList.value.find(w => w.id === id);
            if (wallet) wallet.name = newName;
            if (activeWallet.value?.id === id) {
                activeWallet.value.name = newName;
            }
        }
    } catch (e) {
        console.error('Failed to rename wallet', e);
    }
}

async function createWallet() {
    if (!password.value) return;
    isCreating.value = true;
    error.value = '';

    try {
        const res = await window.lumen.wallet.create(password.value);
        if (res.ok) {
            // Show Backup Screen first, do NOT set activeWallet yet (unless we want background to be dashboard, but we use v-else-if so no)
            backupData.value = res.wallet;
            showBackup.value = true;
        } else {
            error.value = res.error || 'Failed to create wallet';
        }
    } catch (e: any) {
        error.value = e.message;
    } finally {
        isCreating.value = false;
    }
}

function openSettings() {
    showSettings.value = !showSettings.value;
}

function requestReveal() {
    showSettings.value = false;
    showUnlock.value = true;
    password.value = ''; // Reset password field for entry
    error.value = '';
}

async function confirmReveal() {
    if (!password.value) return;
    
    try {
        const res = await window.lumen.wallet.reveal({ 
            id: activeWallet.value.id, 
            password: password.value 
        });
        
        if (res.ok) {
            backupData.value = { ...res.data, isReveal: true };
            showUnlock.value = false;
            showBackup.value = true;
            password.value = '';
        } else {
            error.value = res.error || 'Incorrect Password';
        }
    } catch (e: any) {
        error.value = e.message;
    }
}

function finishBackup() {
    if (backupData.value) {
        if (!backupData.value.isReveal) {
            activeWallet.value = backupData.value;
        }
        showBackup.value = false;
        backupData.value = null; // Clear sensitive data
    }
}

async function importWallet() {
    if (!importMnemonic.value || !password.value) return;
    isCreating.value = true;
    error.value = '';

    try {
        const res = await window.lumen.wallet.import({
            mnemonic: importMnemonic.value,
            password: password.value,
            pqcKey: importPqcKey.value || undefined,
            pqcBackup: importPqcKey.value || undefined  // Try as backup JSON first
        });

        if (res.ok) {
            // Import successful
            // If user provided their own PQC key, skip backup screen and go to wallet
            if (importPqcKey.value) {
                // User provided existing PQC key, no need to show backup
                importWalletMode.value = false;
                importMnemonic.value = '';
                importPqcKey.value = '';
                password.value = '';
                isCreating.value = false;
                
                // Wallet will be loaded automatically by onMounted
                window.location.reload(); // Refresh to show new wallet
            } else {
                // Generated new PQC key, show backup screen
                backupData.value = { ...res.wallet, isReveal: false };
                showBackup.value = true;
                importWalletMode.value = false;
                importMnemonic.value = '';
                importPqcKey.value = '';
                password.value = '';
            }
        } else {
            error.value = res.error || 'Failed to import wallet';
        }
    } catch (e: any) {
        error.value = e.message;
    } finally {
        isCreating.value = false;
    }
}

function logout() {
    activeWallet.value = null;
    password.value = '';
    error.value = '';
    backupData.value = null;
    showSettings.value = false;
    showBackup.value = false;
    showUnlock.value = false;
    importWalletMode.value = false;
    importMnemonic.value = '';
    importPqcKey.value = '';
    copiedTarget.value = '';
    
    // Clear session from localStorage
    localStorage.removeItem('lumen_active_wallet_id');
}

async function confirmDeleteWallet() {
    if (!activeWallet.value) return;
    
    const confirmed = confirm(
        `Are you sure you want to delete "${activeWallet.value.name}"?\n\n` +
        `Address: ${activeWallet.value.address}\n\n` +
        `This action CANNOT be undone. Make sure you have backed up your recovery phrase and PQC key!`
    );
    
    if (confirmed) {
        await deleteWallet(activeWallet.value.id);
    }
}

async function deleteWallet(id: string) {
    try {
        const res = await window.lumen.wallet.delete({ id });
        if (res.ok) {
            // Remove from local list
            walletList.value = walletList.value.filter(w => w.id !== id);
            
            // If deleted wallet was active, logout
            if (activeWallet.value?.id === id) {
                logout();
            }
            
            showSettings.value = false;
        }
    } catch (e) {
        console.error('Failed to delete wallet', e);
        alert('Failed to delete wallet: ' + e.message);
    }
}

function copy(text: string, target?: string) {
    navigator.clipboard.writeText(text);
    if (target) {
        copiedTarget.value = target;
        setTimeout(() => copiedTarget.value = '', 2000);
    }
}

async function refreshWallet() {
    if (!activeWallet.value) return;
    isLoading.value = true;
    
    try {
        await fetchBalance();
    } catch (e) {
        console.error('Failed to refresh wallet', e);
    } finally {
        isLoading.value = false;
    }
}

async function fetchBalance() {
    if (!activeWallet.value) return;
    
    try {
        const res = await window.lumen.rpc.getBalance(activeWallet.value.address);
        if (res.ok) {
            // Update asset balance
            if (assets.value.length > 0) {
                assets.value[0].amount = res.balance;
                assets.value[0].value = res.balance * 0; // Price will be updated later
                assets.value[0].price = '$0.00'; // Placeholder
            }
        }
    } catch (e) {
        console.error('Failed to fetch balance', e);
    }
}

// Send Transaction Logic
const canSend = computed(() => {
    return sendForm.value.toAddress && 
           sendForm.value.amount && 
           parseFloat(sendForm.value.amount) > 0 &&
           sendForm.value.password &&
           !isSending.value;
});

function openSendModal() {
    showSendModal.value = true;
    sendError.value = '';
    sendSuccess.value = '';
    sendForm.value = {
        toAddress: '',
        amount: '',
        memo: '',
        password: ''
    };
}

function closeSendModal() {
    showSendModal.value = false;
    sendError.value = '';
    sendSuccess.value = '';
    sendForm.value = {
        toAddress: '',
        amount: '',
        memo: '',
        password: ''
    };
}

async function executeSend() {
    if (!canSend.value || !activeWallet.value) return;
    
    isSending.value = true;
    sendError.value = '';
    sendSuccess.value = '';
    
    try {
        // Validate address format
        if (!sendForm.value.toAddress.startsWith('lmn1')) {
            sendError.value = 'Invalid Lumen address format (must start with lmn1)';
            isSending.value = false;
            return;
        }
        
        // Validate amount
        const amount = parseFloat(sendForm.value.amount);
        const available = assets.value[0]?.amount || 0;
        if (amount > available) {
            sendError.value = `Insufficient balance. Available: ${available.toFixed(4)} LMN`;
            isSending.value = false;
            return;
        }
        
        // Send transaction
        const res = await window.lumen.tx.send({
            walletId: activeWallet.value.id,
            toAddress: sendForm.value.toAddress,
            amount: sendForm.value.amount,
            memo: sendForm.value.memo,
            password: sendForm.value.password
        });
        
        if (res.ok) {
            sendSuccess.value = `TX: ${res.txHash}`;
            // Refresh balance after 2 seconds
            setTimeout(() => {
                fetchBalance();
                // Close modal after 3 seconds
                setTimeout(() => closeSendModal(), 3000);
            }, 2000);
        } else {
            sendError.value = res.error || 'Transaction failed';
        }
    } catch (e: any) {
        sendError.value = e.message || 'Unknown error';
    } finally {
        isSending.value = false;
    }
}

function truncateAddress(addr: string) {
    if (!addr) return '';
    return addr.slice(0, 8) + '...' + addr.slice(-4);
}

function copyAddress() {
    if (activeWallet.value?.address) {
        copy(activeWallet.value.address, 'address');
    }
}

function getIcon(symbol: string) {
    if (symbol === 'ATOM') return Atom;
    if (symbol === 'OSMO') return Gem;
    if (symbol === 'LUM') return Coins;
    return CircleDollarSign;
}
// Export Methods
const openExportModal = () => {
    showExportModal.value = true;
    exportPassword.value = '';
    exportedJson.value = '';
    exportError.value = '';
};

const closeExportModal = () => {
    showExportModal.value = false;
    exportPassword.value = '';
    exportedJson.value = '';
    exportError.value = '';
};

const executeExport = async () => {
    if (!exportPassword.value) {
        exportError.value = 'Password is required';
        return;
    }
    
    isExporting.value = true;
    exportError.value = '';
    
    try {
        const res = await window.lumen.wallet.exportPqc({
            id: activeWallet.value.id,
            password: exportPassword.value
        });
        
        if (res.ok) {
            exportedJson.value = res.backupSync;
        } else {
            exportError.value = res.error || 'Failed to export keys';
        }
    } catch (e: any) {
        exportError.value = e.message || 'Export failed';
    } finally {
        isExporting.value = false;
    }
};
</script>

<style scoped>
/* REUSED UTILS */
.color-gray-500 { color: #64748b; }
.color-gray-400 { color: #94a3b8; }
.color-black { color: #0f172a; }
.color-blue-500 { color: #3b82f6; }
.color-blue-700 { color: #1d4ed8; }
.color-red-600 { color: #dc2626; }
.bg-gray-100 { background-color: #f1f5f9; }
.bg-gray-50 { background-color: #f8fafc; }
.bg-blue-50 { background-color: #eff6ff; }
.bg-blue-100 { background-color: #dbeafe; }
.bg-blue-500 { background-color: #3b82f6; }
.bg-red-50 { background-color: #fef2f2; }
.border-color-light { border-color: #e2e8f0; }
.border-color-blue-200 { border-color: #bfdbfe; }
.border-1px { border-width: 1px; border-style: solid; }
.color-green-mint { color: #10b981; }
.color-green-600 { color: #16a34a; }

/* LAYOUT */
.font-sans { font-family: 'Inter', sans-serif; }
.h-300 { height: 3rem; }
.size-400 { width: 4rem; height: 4rem; }
.size-300 { width: 3rem; height: 3rem; }
.size-250 { width: 3rem; height: 3rem; }
.size-150 { width: 1.5rem; height: 1.5rem; }
.size-60 { width: 60px; height: 60px; }
.size-50 { width: 0.5rem; height: 0.5rem; }
.size-35 { width: 35px; height: 35px; }
.size-30 { width: 30px; height: 30px; }
.size-12 { width: 12px; height: 12px; }
.size-10 { width: 10px; height: 10px; }
.max-w-400 { max-width: 400px; }
.max-w-600 { max-width: 600px; }
.min-w-200 { min-width: 200px; }
.min-w-250 { min-width: 250px; }
.text-center { text-align: center; }
.text-left { text-align: left; }
.gap-100 { gap: 1.5rem; }
.margin-bottom-100 { margin-bottom: 2rem; }
.margin-bottom-150 { margin-bottom: 3rem; }
.margin-bottom-10 { margin-bottom: 10px; }
.padding-left-10 { padding-left: 10px; }

/* Icon button small */
.icon-btn-small {
    border: none;
    background: transparent;
    padding: 4px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
}
.icon-btn-small:hover {
    background-color: #f1f5f9;
}

/* COMPONENTS */
.input-field {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
    color: #0f172a;
    font-size: 0.95rem;
    outline: none;
    transition: all 0.2s;
}
.input-field:focus {
    border-color: #3b82f6;
    background: white;
    box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
}

.btn-primary {
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 8px;
    background: #3b82f6;
    color: white;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    justify-content: center;
    align-items: center;
}
.btn-primary:disabled {
    background: #94a3b8;
    cursor: not-allowed;
}
.btn-primary:not(:disabled):hover {
    background: #2563eb;
}

.btn-ghost {
    width: 100%;
    padding: 12px;
    border: none;
    background: transparent;
    color: #64748b;
    font-weight: 500;
    cursor: pointer;
}
.btn-ghost:hover { color: #3b82f6; }

/* ANIMATION */
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* EXISTING STYLES (Balance, Actions, Assets) */
.balance-text { font-size: 3rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.icon-btn { border: none; background: transparent; padding: 8px; border-radius: 50%; cursor: pointer; transition: background 0.2s; }
.icon-btn:hover { background-color: #f1f5f9; }
.badge-success { background-color: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 100px; font-weight: 600; }
.badge-neutral { background-color: #f1f5f9; color: #64748b; padding: 2px 8px; border-radius: 100px; font-weight: 600; }
.action-item { display: flex; flex-direction: column; align-items: center; gap: 8px; border: none; background: transparent; cursor: pointer; }
.circle-btn { width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
.group:hover .group-hover-scale { transform: scale(1.05); }
.label { font-size: 0.8rem; font-weight: 500; color: #64748b; }
.tab-btn { border: none; background: transparent; padding: 8px 16px; font-size: 0.9rem; font-weight: 600; color: #94a3b8; cursor: pointer; }
.tab-btn.active { color: #3B82F6; background: #eff6ff; border-radius: 20px; }
.asset-row:hover { background-color: #f8fafc; }
.animate-fade-in { animation: fadeIn 0.5s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* UTILS ADDITIONS */
.bg-black-50 { background-color: rgba(0,0,0,0.5); }
.fixed { position: fixed; }
.absolute { position: absolute; }
.relative { position: relative; }
.top-0 { top: 0; }
.left-0 { left: 0; }
.top-100 { top: 100%; }
.right-0 { right: 0; }
.z-10 { z-index: 10; }
.z-20 { z-index: 20; }
.shadow-lg { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); }
.min-w-200 { min-width: 200px; }
.hover-bg-gray-50:hover { background-color: #f8fafc; }
/* GRID HELPERS (Since theme.css is missing them) */
.input-field { box-sizing: border-box; width: 100%; border: 1px solid #e6eaf1; border-radius: 8px; padding: 10px; outline: none; }
.input-field:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
.w-full { width: 100%; }
.h-full { height: 100%; }
.object-cover { object-fit: cover; }
.grid { display: grid; }
.grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
.grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
.grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
.grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
.grid-cols-6 { grid-template-columns: repeat(6, 1fr); }
.gap-5 { gap: 5px; }
.gap-10 { gap: 10px; }
.gap-15 { gap: 15px; }
.gap-20 { gap: 20px; }
.gap-25 { gap: 25px; }
.gap-50 { gap: 50px; }
.text-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flex-shrink-0 { flex-shrink: 0; }
.overflow-hidden { overflow: hidden; }
.flex-justify-between { justify-content: space-between; }
.margin-top-5 { margin-top: 5px; }
.min-h-50 { min-height: 50px; }
.min-h-80 { min-height: 80px; }
.max-w-450 { max-width: 450px; }
.top-50-translate-y { top: 50%; transform: translateY(-50%); }
.bg-green-50 { background-color: #f0fdf4; }
.color-green-600 { color: #16a34a; }
/* NEW UTILS FOR BACKUP UI */
.max-w-700 { max-width: 700px; }
.padding-5-10 { padding: 5px 10px; }
.padding-10 { padding: 10px; }
.padding-20 { padding: 20px; }
.margin-bottom-30 { margin-bottom: 30px; }
.margin-bottom-25 { margin-bottom: 25px; }
.margin-bottom-20 { margin-bottom: 20px; }
.border-radius-8px { border-radius: 8px; }
.shadow-sm { box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
.w-20 { width: 1.5rem; display: inline-block; }
.text-right { text-align: right; }
.margin-bottom-1 { margin-bottom: 2px; }
.h-200 { height: 200px; }
.break-all { word-break: break-all; white-space: pre-wrap; }
.overflow-y-auto { overflow-y: auto; }
.h-fit { height: fit-content; }
.padding-bottom-100 { padding-bottom: 100px; }
/* MODAL & NEW UTILS */
.backdrop-blur-sm { backdrop-filter: blur(4px); }
.shadow-xl { box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); }
.border-radius-20px { border-radius: 20px; }
.border-radius-10px { border-radius: 10px; }
.size-300 { width: 3rem; height: 3rem; }
.size-60 { width: 60px; height: 60px; }
.padding-30 { padding: 30px; }
.padding-left-45 { padding-left: 45px; }
.padding-left-15 { padding-left: 15px; }
.max-w-340 { max-width: 340px; }
.gap-15 { gap: 0.9375rem; } /* 15px */
.mx-auto { margin-left: auto; margin-right: auto; }
.shadow-md { box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
.transform-scale-in { animation: scaleIn 0.2s ease-out; }
.bg-gradient-to-r { background: linear-gradient(90deg, #60a5fa 0%, #2563eb 100%); }
.margin-right-20 { margin-right: 20px; }
.size-50 { width: 50px; height: 50px; }
.whitespace-pre { white-space: pre; overflow-x: auto; }
@keyframes scaleIn {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
}
</style>
