import React from 'react';
import PropTypes from 'prop-types';
import {
	 Image, BackHandler, Linking
} from 'react-native';
import {
	Text, Keyboard, StyleSheet, TouchableOpacity, View, Alert
} from 'react-native';
import { connect } from 'react-redux';
import * as FileSystem from 'expo-file-system';
import DocumentPicker from 'react-native-document-picker';
import ActionSheet from 'react-native-action-sheet';
import RNUserDefaults from 'rn-user-defaults';
import { encode } from 'base-64';
import parse from 'url-parse';
import EventEmitter from '../utils/events';
import {
	selectServerRequest, serverRequest, serverInitAdd, serverFinishAdd
} from '../actions/server';
import { appStart as appStartAction } from '../actions';
import sharedStyles from './Styles';
import Button from '../containers/Button';
import TextInput from '../containers/TextInput';
import OnboardingSeparator from '../containers/OnboardingSeparator';
import FormContainer, { FormContainerInner } from '../containers/FormContainer';
import I18n from '../i18n';
import { isIOS } from '../utils/deviceInfo';
import { themes } from '../constants/colors';
import log from '../utils/log';
import { animateNextTransition } from '../utils/layoutAnimation';
import { withTheme } from '../theme';
import { setBasicAuth, BASIC_AUTH_KEY } from '../utils/fetch';
import { themedHeader } from '../utils/navigation';
import { CloseModalButton } from '../containers/HeaderButton';

const styles = StyleSheet.create({
	title: {
		...sharedStyles.textBold,
		fontSize: 22
	},
	inputContainer: {
		marginTop: 24,
		marginBottom: 32
	},
	certificatePicker: {
		marginBottom: 32,
		alignItems: 'center',
		justifyContent: 'flex-end'
	},
	chooseCertificateTitle: {
		fontSize: 13,
		...sharedStyles.textRegular
	},
	stayhome: {
		fontSize: 15,
		...sharedStyles.textRegular
	},
	chooseCertificate: {
		fontSize: 13,
		...sharedStyles.textSemibold
	},
	description: {
		...sharedStyles.textRegular,
		fontSize: 14,
		textAlign: 'left',
		marginBottom: 24
	},
	connectButton: {
		marginBottom: 0
	},
	logo: {
		width: 200,
		height: 200,
	
	  },
	  container: {
		justifyContent: 'center',
		alignItems: 'center',
		flex: 1
	  },
});

class NewServerView extends React.Component {
	static navigationOptions = ({ screenProps, navigation }) => {
		const previousServer = navigation.getParam('previousServer', null);
		const close = navigation.getParam('close', () => {});
		return {
			headerLeft: previousServer ? <CloseModalButton navigation={navigation} /> : undefined,
		
			title: 'Together we Can ...',
			
		};
	
	}

	static propTypes = {
		navigation: PropTypes.object,
		theme: PropTypes.string,
		connecting: PropTypes.bool.isRequired,
		connectServer: PropTypes.func.isRequired,
		selectServer: PropTypes.func.isRequired,
		currentServer: PropTypes.string,
		initAdd: PropTypes.func,
		finishAdd: PropTypes.func
	}

	constructor(props) {
		super(props);
		this.previousServer = props.navigation.getParam('previousServer');
		props.navigation.setParams({ close: this.close, previousServer: this.previousServer });

		// Cancel
		this.options = [I18n.t('Cancel')];
		this.CANCEL_INDEX = 0;

		// Delete
		this.options.push(I18n.t('Delete'));
		this.DELETE_INDEX = 1;

		this.state = {
			text: '4',
			connectingOpen: false,
			certificate: null
		};
		EventEmitter.addEventListener('NewServer', this.handleNewServerEvent);
	}

	componentDidMount() {
		const { initAdd } = this.props;
		if (this.previousServer) {
			initAdd();
		}
	}

	componentWillUnmount() {
		EventEmitter.removeListener('NewServer', this.handleNewServerEvent);
	}

	onChangeText = (text) => {
		this.setState({ text });
	}

	close = () => {
		const { selectServer, currentServer, finishAdd } = this.props;
		if (this.previousServer !== currentServer) {
			selectServer(this.previousServer);
		}
		finishAdd();
	}

	handleNewServerEvent = (event) => {
		let { server } = event;
		const { connectServer } = this.props;
		this.setState({ text: server });
		server = this.completeUrl(server);
		connectServer(server);
	}

	submit = async() => {
		const { text, certificate } = this.state;
		const { connectServer } = this.props;
		let cert = null;

		this.setState({ connectingOpen: false });

		if (certificate) {
			const certificatePath = `${ FileSystem.documentDirectory }/${ certificate.name }`;
			try {
				await FileSystem.copyAsync({ from: certificate.path, to: certificatePath });
			} catch (e) {
				log(e);
			}
			cert = {
				path: this.uriToPath(certificatePath), // file:// isn't allowed by obj-C
				password: certificate.password
			};
		}
		const server = 'https://chat.portsaid.life';
		await this.basicAuth(server, text);
		connectServer(server, cert);

	
	}

	connectOpen = () => {
		this.setState({ connectingOpen: true });
		const { connectServer } = this.props;
		connectServer('https://open.rocket.chat');
	}

	basicAuth = async(server, text) => {
		try {
			const parsedUrl = parse(text, true);
			if (parsedUrl.auth.length) {
				const credentials = encode(parsedUrl.auth);
				await RNUserDefaults.set(`${ BASIC_AUTH_KEY }-${ server }`, credentials);
				setBasicAuth(credentials);
			}
		} catch {
			// do nothing
		}
	}

	chooseCertificate = async() => {
		try {
			const res = await DocumentPicker.pick({
				type: ['com.rsa.pkcs-12']
			});
			const { uri: path, name } = res;
			Alert.prompt(
				I18n.t('Certificate_password'),
				I18n.t('Whats_the_password_for_your_certificate'),
				[
					{
						text: 'OK',
						onPress: password => this.saveCertificate({ path, name, password })
					}
				],
				'secure-text'
			);
		} catch (e) {
			if (!DocumentPicker.isCancel(e)) {
				log(e);
			}
		}
	}

	completeUrl = (url) => {
		const parsedUrl = parse(url, true);
		if (parsedUrl.auth.length) {
			url = parsedUrl.origin;
		}

		url = 'https://chat.portsaid.life';
		return url;
	}

	uriToPath = uri => uri.replace('file://', '');

	saveCertificate = (certificate) => {
		animateNextTransition();
		this.setState({ certificate });
	}

	handleDelete = () => this.setState({ certificate: null }); // We not need delete file from DocumentPicker because it is a temp file

	showActionSheet = () => {
		ActionSheet.showActionSheetWithOptions({
			options: this.options,
			cancelButtonIndex: this.CANCEL_INDEX,
			destructiveButtonIndex: this.DELETE_INDEX
		}, (actionIndex) => {
			if (actionIndex === this.DELETE_INDEX) { this.handleDelete(); }
		});
	}

	renderCertificatePicker = () => {
		const { certificate } = this.state;
		const { theme } = this.props;
		return (
			<View style={styles.certificatePicker}>
				<Text
					style={[
						styles.chooseCertificateTitle,
						{ color: themes[theme].auxiliaryText }
					]}
				>
					{certificate ? I18n.t('Your_certificate') : I18n.t('Do_you_have_a_certificate')}
				</Text>
				<TouchableOpacity
					onPress={certificate ? this.showActionSheet : this.chooseCertificate}
					testID='new-server-choose-certificate'
				>
					<Text
						style={[
							styles.chooseCertificate,
							{ color: themes[theme].tintColor }
						]}
					>
						{certificate ? certificate.name : I18n.t('Apply_Your_Certificate')}
					</Text>
				</TouchableOpacity>
			</View>
		);
	}

	render() {
		const { connecting, theme } = this.props;
		const { text, connectingOpen } = this.state;
		return (
			
			<FormContainer theme={theme} >
				<FormContainerInner>
				
				<View style={styles.container}>
				<Image 
				 style={styles.logo}
				
                source={{
          uri: 'https://lh5.googleusercontent.com/proxy/9cS6TBq0drBJWsO1wqYTCVjeDVjkEY3nhM5kcxcSpNt0hHIXBFul8zz5pVNJL8loUf83QgIK3RE0PtBmveEvxNcLFcP9dhgEAc7a-oa1hpVjRZcVcAk',
        }}
      />
	  </View>
	  <View style={styles.container}>
	  <Text style={[styles.title, { color: themes[theme].titleText }]}>Welcome to Portsaid Doctors</Text>
	  <Text style={[styles.stayhome, { color: themes[theme].titleText }]}>نصائح عامه من أطباء بورسعيد لأهل بورسعيد بدون مقابل </Text>
	  <Text style={[styles.stayhome, { color: themes[theme].titleText }]}>#stayhome </Text>
	  </View>
	  
					<Button
						title='Please Join Us...'
						type='primary'
						onPress={this.submit}
						//disabled={!text || connecting}
						loading={!connectingOpen && connecting}
						style={styles.connectButton}
						testID='new-server-view-button'
						theme={theme}
					/>
				
				</FormContainerInner>
				{ isIOS ? this.renderCertificatePicker() : null }
			</FormContainer>
		);
	}
}

const mapStateToProps = state => ({
	connecting: state.server.connecting
});

const mapDispatchToProps = dispatch => ({
	connectServer: (server, certificate) => dispatch(serverRequest(server, certificate)),
	initAdd: () => dispatch(serverInitAdd()),
	finishAdd: () => dispatch(serverFinishAdd()),
	selectServer: server => dispatch(selectServerRequest(server)),
	appStart: root => dispatch(appStartAction(root))
});

export default connect(mapStateToProps, mapDispatchToProps)(withTheme(NewServerView));